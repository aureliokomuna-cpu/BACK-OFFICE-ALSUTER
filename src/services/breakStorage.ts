// Break sessions storage and business logic service with Central Server Synchronization
// Syncs seamlessly across multiple phones (HP Manager & HP Staff) and web browser tabs in real-time
import { Employee, BreakSession, DailyStaffSummary } from '../types';
import { DEFAULT_EMPLOYEES, cleanEmployeeName } from '../data/defaultEmployees';
import { cloudSync } from './cloudSyncService';
import {
  applyServerCustomAudios,
  registerActiveSessionChecker,
  cancelAnnouncementsForStaff,
} from './soundService';

const STORAGE_KEYS = {
  EMPLOYEES: 'informa_employees_v1',
  SESSIONS: 'informa_break_sessions_v1',
  SERVER_SYNC_TIME: 'informa_sync_time_v1',
  LAST_RESET_TIME: 'informa_reset_time_v1',
};

let localLastResetTime = 0;
try {
  const savedReset = localStorage.getItem(STORAGE_KEYS.LAST_RESET_TIME);
  if (savedReset) {
    localLastResetTime = Number(savedReset) || 0;
  }
} catch {}

const NTFY_TOPIC_URL = 'https://ntfy.sh/informa_alamsutera_sync_channel';

// Helper to reconcile local and remote sessions bidirectionally
interface ReconciliationResult {
  merged: BreakSession[];
  localUpdated: boolean;
  remoteNeedsUpdate: boolean;
}

function reconcileSessionSets(
  local: BreakSession[],
  remote: BreakSession[],
  cloudLastReset: number = 0
): ReconciliationResult {
  const map = new Map<string, BreakSession>();
  let localUpdated = false;
  let remoteNeedsUpdate = false;

  // Filter out any sessions prior to a manager reset timestamp or older than 48 hours if ended
  const now = Date.now();
  const validLocal = local.filter((s) => {
    if (s.startTime < cloudLastReset) return false;
    if (s.endTime !== null && now - s.endTime > 48 * 3600 * 1000) return false;
    return true;
  });
  if (validLocal.length !== local.length) {
    localUpdated = true;
  }

  const validRemote = remote.filter((s) => {
    if (s.startTime < cloudLastReset) return false;
    if (s.endTime !== null && now - s.endTime > 48 * 3600 * 1000) return false;
    return true;
  });

  for (const s of validLocal) {
    map.set(s.id, { ...s });
  }

  for (const r of validRemote) {
    const l = map.get(r.id);
    if (!l) {
      // Remote has a session that local does not have
      map.set(r.id, { ...r });
      localUpdated = true;
    } else {
      let mergedSession = { ...l };
      let sessionModified = false;

      // 1. If remote ended but local is still open
      if (r.endTime !== null && l.endTime === null) {
        mergedSession.endTime = r.endTime;
        mergedSession.durationMinutes = r.durationMinutes;
        sessionModified = true;
        localUpdated = true;
      } else if (l.endTime !== null && r.endTime === null) {
        // Local has ended but remote is still open -> remote needs update
        remoteNeedsUpdate = true;
      }

      // 2. Alarms state merge
      if (r.warningPlayed && !l.warningPlayed) {
        mergedSession.warningPlayed = true;
        sessionModified = true;
        localUpdated = true;
      } else if (l.warningPlayed && !r.warningPlayed) {
        remoteNeedsUpdate = true;
      }

      if (r.alarmPlayed && !l.alarmPlayed) {
        mergedSession.alarmPlayed = true;
        sessionModified = true;
        localUpdated = true;
      } else if (l.alarmPlayed && !r.alarmPlayed) {
        remoteNeedsUpdate = true;
      }

      if (r.overduePlayed && !l.overduePlayed) {
        mergedSession.overduePlayed = true;
        sessionModified = true;
        localUpdated = true;
      } else if (l.overduePlayed && !r.overduePlayed) {
        remoteNeedsUpdate = true;
      }

      // 3. Start time changes (e.g. simulation or time adjustment)
      if (Math.abs(r.startTime - l.startTime) > 1000) {
        if (r.startTime < l.startTime) {
          mergedSession.startTime = r.startTime;
          sessionModified = true;
          localUpdated = true;
        } else {
          remoteNeedsUpdate = true;
        }
      }

      if (sessionModified) {
        map.set(r.id, mergedSession);
      }
    }
  }

  // Check if local has sessions that remote lacks
  const remoteIdSet = new Set(validRemote.map((r) => r.id));
  for (const s of validLocal) {
    if (!remoteIdSet.has(s.id)) {
      remoteNeedsUpdate = true;
    }
  }

  return {
    merged: Array.from(map.values()),
    localUpdated,
    remoteNeedsUpdate,
  };
}

// In-flight guard to avoid concurrent conflicting sync requests
let isSyncPushing = false;

// Broadcast to server directly and trigger pubsub signal
export async function pushToCloudDirect(sessions: BreakSession[], lastResetTime: number = 0) {
  if (isSyncPushing) return;
  isSyncPushing = true;
  try {
    const res = await fetch('/api/sessions/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions, lastResetTime: lastResetTime || 0 }),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    if (res && res.success && Array.isArray(res.sessions)) {
      reconcileSessionCollection(res.sessions, res.lastResetTime || 0, true);
    }

    fetch(NTFY_TOPIC_URL, {
      method: 'POST',
      body: JSON.stringify({ type: 'SYNC', timestamp: Date.now() }),
    }).catch(() => {});
  } catch (e) {
    console.debug('Server push warning:', e);
  } finally {
    isSyncPushing = false;
  }
}

// BroadcastChannel for instant same-browser cross-tab sync
let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  syncChannel = new BroadcastChannel('informa_break_channel');
}

// In-memory reactive state
let memorySessions: BreakSession[] = [];
let memoryEmployees: Employee[] = [];
let isInitialized = false;

// 10-second authoritative server sync parameters
export const AUTO_REFRESH_INTERVAL_SEC = 10;
let secondsUntilRefresh = AUTO_REFRESH_INTERVAL_SEC;
let serverClockSkewMs = 0;
let latestServerUpdateTimestamp = 0;
let lastSyncTimestamp = Date.now();

/**
 * Returns the exact current time synchronized with the central server.
 * Completely eliminates any client phone clock drift/inaccuracy across all 250 staff devices!
 */
export function getSynchronizedNow(): number {
  return Date.now() + serverClockSkewMs;
}

export function getLastSyncTimestamp(): number {
  return lastSyncTimestamp;
}

export function getServerClockSkew(): number {
  return serverClockSkewMs;
}

type AutoRefreshListener = (secondsRemaining: number, lastSyncTime: number) => void;
const autoRefreshListeners = new Set<AutoRefreshListener>();

export function subscribeAutoRefresh(listener: AutoRefreshListener): () => void {
  autoRefreshListeners.add(listener);
  listener(secondsUntilRefresh, lastSyncTimestamp);
  return () => {
    autoRefreshListeners.delete(listener);
  };
}

function notifyAutoRefreshListeners(seconds: number, lastSyncTime: number = lastSyncTimestamp) {
  secondsUntilRefresh = seconds;
  autoRefreshListeners.forEach((l) => {
    try {
      l(seconds, lastSyncTime);
    } catch {}
  });
}

// Fast O(1) hash index for 250+ employees
let employeeNipMap = new Map<string, Employee>();

function updateEmployeeMap(list: Employee[]) {
  const map = new Map<string, Employee>();
  for (const emp of list) {
    if (emp && emp.nip) {
      const clean = emp.nip.trim();
      map.set(clean, emp);
      const parsed = parseInt(clean, 10);
      if (!isNaN(parsed)) {
        map.set(String(parsed), emp);
      }
    }
  }
  employeeNipMap = map;
}

type ChangeListener = () => void;
const changeListeners = new Set<ChangeListener>();

export function subscribeDataChanges(listener: ChangeListener): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function notifySubscribers() {
  changeListeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.error(e);
    }
  });
}

// Standardized Indonesian Store Timezone (WIB: Asia/Jakarta)
export function getTodayDateString(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const wib = new Date(utc + 7 * 3600000);
    const year = wib.getFullYear();
    const month = String(wib.getMonth() + 1).padStart(2, '0');
    const day = String(wib.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

// ---------------- Initialization & Server Sync ---------------- //
function loadInitialCache() {
  if (typeof window === 'undefined') return;
  try {
    const savedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (savedSessions) {
      const parsed: BreakSession[] = JSON.parse(savedSessions);
      // Clean up ancient abandoned breaks (> 16 hours ago)
      const now = Date.now();
      memorySessions = parsed.map((s) => {
        if (s.endTime === null && now - s.startTime > 16 * 3600 * 1000) {
          return {
            ...s,
            endTime: s.startTime + 40 * 60 * 1000,
            durationMinutes: 40,
          };
        }
        return s;
      });
    }
  } catch {}

  try {
    const savedEmployees = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    if (savedEmployees) {
      memoryEmployees = JSON.parse(savedEmployees);
    } else {
      memoryEmployees = DEFAULT_EMPLOYEES;
    }
  } catch {
    memoryEmployees = DEFAULT_EMPLOYEES;
  }
  updateEmployeeMap(memoryEmployees);
}

loadInitialCache();

// Register session checker so sound queue NEVER calls staff who already checked out!
registerActiveSessionChecker((nip, sessionId, name) => {
  const all = getAllSessions();
  if (sessionId && sessionId.startsWith('brk_')) {
    const s = all.find((x) => x.id === sessionId);
    if (s) {
      return s.endTime === null;
    }
  }
  if (nip && !isNaN(Number(nip))) {
    const cleanNip = String(nip).trim();
    const active = all.find(
      (x) =>
        (x.nip === cleanNip ||
          (!isNaN(parseInt(cleanNip, 10)) && parseInt(x.nip, 10) === parseInt(cleanNip, 10))) &&
        x.endTime === null
    );
    return Boolean(active);
  }
  if (name) {
    const cleanName = name.toLowerCase().trim();
    const active = all.find(
      (x) =>
        (x.employeeName.toLowerCase().includes(cleanName) ||
          cleanName.includes(x.employeeName.toLowerCase())) &&
        x.endTime === null
    );
    return Boolean(active);
  }
  return false;
});

export function reconcileSessionCollection(
  incomingSessions: BreakSession[],
  incomingResetTime: number = 0,
  isAuthoritativeServer: boolean = false
): void {
  if (!Array.isArray(incomingSessions)) return;

  const now = getSynchronizedNow();
  if (incomingResetTime > localLastResetTime) {
    localLastResetTime = incomingResetTime;
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_RESET_TIME, String(localLastResetTime));
    } catch {}
  }

  const sessionMap = new Map<string, BreakSession>();

  if (isAuthoritativeServer) {
    // 1. Authoritative Server source:
    if (incomingSessions.length <= 2 && memorySessions.length > incomingSessions.length) {
      // Partial single-session response from start/end endpoint: update target and keep others
      for (const s of memorySessions) {
        sessionMap.set(s.id, s);
      }
      for (const remote of incomingSessions) {
        const local = sessionMap.get(remote.id);
        if (local) {
          sessionMap.set(remote.id, {
            ...local,
            ...remote,
            warningPlayed: local.warningPlayed || remote.warningPlayed,
            alarmPlayed: local.alarmPlayed || remote.alarmPlayed,
            overduePlayed: local.overduePlayed || remote.overduePlayed,
          });
        } else {
          sessionMap.set(remote.id, remote);
        }
      }
    } else {
      // Full authoritative server snapshot
      for (const remote of incomingSessions) {
        if (localLastResetTime > 0 && remote.startTime < localLastResetTime) continue;
        // Auto-close abandoned breaks > 16 hours
        if (remote.endTime === null && now - remote.startTime > 16 * 3600 * 1000) {
          sessionMap.set(remote.id, {
            ...remote,
            endTime: remote.startTime + 40 * 60 * 1000,
            durationMinutes: 40,
          });
        } else {
          sessionMap.set(remote.id, remote);
        }
      }

      // Check local memory sessions
      for (const local of memorySessions) {
        if (localLastResetTime > 0 && local.startTime < localLastResetTime) continue;

        const serverVersion = sessionMap.get(local.id);
        if (serverVersion) {
          // If local ended but server hasn't registered end yet: finished always wins
          if (local.endTime !== null && serverVersion.endTime === null) {
            sessionMap.set(local.id, {
              ...serverVersion,
              endTime: local.endTime,
              durationMinutes: local.durationMinutes,
            });
          }
          // Preserve played flags if marked locally
          const cur = sessionMap.get(local.id)!;
          cur.warningPlayed = cur.warningPlayed || local.warningPlayed;
          cur.alarmPlayed = cur.alarmPlayed || local.alarmPlayed;
          cur.overduePlayed = cur.overduePlayed || local.overduePlayed;
        } else {
          // Local-only session: only keep if started recently (< 20 seconds) and still waiting for server
          if (local.endTime === null && now - local.startTime < 20000) {
            sessionMap.set(local.id, local);
          }
        }
      }
    }
  } else {
    // Peer-to-peer / MQTT merge
    for (const s of memorySessions) {
      if (localLastResetTime > 0 && s.startTime < localLastResetTime) continue;
      // Auto-close abandoned breaks > 16 hours
      if (s.endTime === null && now - s.startTime > 16 * 3600 * 1000) {
        sessionMap.set(s.id, {
          ...s,
          endTime: s.startTime + 40 * 60 * 1000,
          durationMinutes: 40,
        });
        continue;
      }
      sessionMap.set(s.id, s);
    }

    for (const remote of incomingSessions) {
      if (localLastResetTime > 0 && remote.startTime < localLastResetTime) continue;

      const local = sessionMap.get(remote.id);
      if (!local) {
        if (remote.endTime === null && now - remote.startTime > 16 * 3600 * 1000) {
          sessionMap.set(remote.id, {
            ...remote,
            endTime: remote.startTime + 40 * 60 * 1000,
            durationMinutes: 40,
          });
        } else {
          sessionMap.set(remote.id, remote);
        }
      } else {
        let merged = { ...local };

        if (local.endTime !== null && remote.endTime === null) {
          merged.endTime = local.endTime;
          merged.durationMinutes = local.durationMinutes;
        } else if (remote.endTime !== null && local.endTime === null) {
          merged.endTime = remote.endTime;
          merged.durationMinutes = remote.durationMinutes;
        }

        if (Math.abs(remote.startTime - local.startTime) > 1000) {
          merged.startTime = remote.startTime;
        }

        merged.warningPlayed = local.warningPlayed || remote.warningPlayed;
        merged.alarmPlayed = local.alarmPlayed || remote.alarmPlayed;
        merged.overduePlayed = local.overduePlayed || remote.overduePlayed;

        sessionMap.set(remote.id, merged);
      }
    }
  }

  // AUTOMATIC CHECKOUT DETECTION:
  // If any session was previously active (endTime === null) and has now ended (endTime !== null),
  // immediately cancel its announcements on this device!
  for (const prev of memorySessions) {
    if (prev.endTime === null) {
      const updated = sessionMap.get(prev.id);
      if (updated && updated.endTime !== null) {
        cancelAnnouncementsForStaff(prev.nip, prev.employeeName, prev.id);
      }
    }
  }

  const merged = Array.from(sessionMap.values()).sort((a, b) => {
    if (b.startTime !== a.startTime) return b.startTime - a.startTime;
    return b.id.localeCompare(a.id);
  });

  if (JSON.stringify(merged) !== JSON.stringify(memorySessions)) {
    memorySessions = merged;
    try {
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(merged));
    } catch {}
    notifySubscribers();
  }
}

export function applyAuthoritativeServerSessions(serverSessions: BreakSession[], resetTime: number = 0) {
  reconcileSessionCollection(serverSessions, resetTime, true);
}

export function reconcileWithCloudSessions(cloudSessions: BreakSession[], resetTime: number = 0) {
  reconcileSessionCollection(cloudSessions, resetTime, false);
}

// Connect CloudSync listener immediately
cloudSync.onSync((cloudSessions, cloudEmployees, cloudResetTime, payload) => {
  if (payload && payload.type === 'STAFF_ENDED_BREAK') {
    cancelAnnouncementsForStaff(payload.nip, payload.employeeName, payload.sessionId);
  }
  if (Array.isArray(cloudSessions)) {
    reconcileSessionCollection(cloudSessions, cloudResetTime || 0, false);
  }
  if (Array.isArray(cloudEmployees) && cloudEmployees.length > 0) {
    if (JSON.stringify(cloudEmployees) !== JSON.stringify(memoryEmployees)) {
      memoryEmployees = cloudEmployees;
      updateEmployeeMap(cloudEmployees);
      try {
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(cloudEmployees));
      } catch {}
      notifySubscribers();
    }
  }
});

export async function fetchServerState(forceFull: boolean = false): Promise<void> {
  if (typeof window === 'undefined') return;
  const tStart = Date.now();
  try {
    const url = `/api/state?t=${Date.now()}`;

    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const tEnd = Date.now();

    if (res && res.success) {
      lastSyncTimestamp = Date.now();

      // Measure round-trip time and calculate clock offset precisely to eliminate clock skew across all 250 phones
      if (typeof res.serverTime === 'number') {
        const roundTripMs = Math.max(0, tEnd - tStart);
        const estimatedServerNow = res.serverTime + Math.round(roundTripMs / 2);
        serverClockSkewMs = estimatedServerNow - tEnd;
      }

      if (typeof res.lastUpdated === 'number') {
        latestServerUpdateTimestamp = res.lastUpdated;
      }

      if (Array.isArray(res.sessions)) {
        reconcileSessionCollection(res.sessions, res.lastResetTime || 0, true);
      }

      if (Array.isArray(res.employees) && res.employees.length > 0) {
        if (JSON.stringify(res.employees) !== JSON.stringify(memoryEmployees)) {
          memoryEmployees = res.employees;
          updateEmployeeMap(res.employees);
          try {
            localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(res.employees));
          } catch {}
          notifySubscribers();
        }
      }

      if (res.customAudios) {
        applyServerCustomAudios(res.customAudios);
      }
      secondsUntilRefresh = AUTO_REFRESH_INTERVAL_SEC;
      notifyAutoRefreshListeners(AUTO_REFRESH_INTERVAL_SEC, lastSyncTimestamp);
      return;
    }

    // Fallback if /api/state not available
    const [sessRes, empRes] = await Promise.all([
      fetch(`/api/sessions?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/employees?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    if (Array.isArray(sessRes)) {
      reconcileSessionCollection(sessRes, 0, true);
    }

    if (Array.isArray(empRes) && empRes.length > 0) {
      if (JSON.stringify(empRes) !== JSON.stringify(memoryEmployees)) {
        memoryEmployees = empRes;
        updateEmployeeMap(empRes);
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(empRes));
        notifySubscribers();
      }
    }
    secondsUntilRefresh = AUTO_REFRESH_INTERVAL_SEC;
    notifyAutoRefreshListeners(AUTO_REFRESH_INTERVAL_SEC, lastSyncTimestamp);
  } catch (err) {
    console.debug('Background server sync warning:', err);
    secondsUntilRefresh = AUTO_REFRESH_INTERVAL_SEC;
    notifyAutoRefreshListeners(AUTO_REFRESH_INTERVAL_SEC, lastSyncTimestamp);
  }
}

// Start Real-Time Sync loop (EventSource + Visibility Listener + 10s Automatic Refresh)
export function initRealtimeSync(): void {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // Immediate authoritative fetch on load
  fetchServerState(true);

  // Listen to same-device BroadcastChannel
  if (syncChannel) {
    syncChannel.onmessage = (event) => {
      const msg = event.data;
      if (msg && msg.type === 'STAFF_ENDED_BREAK') {
        cancelAnnouncementsForStaff(msg.nip, msg.employeeName, msg.sessionId);
      }
      fetchServerState(true);
    };
  }

  // Connect Local Server-Sent Events (SSE) with auto-reconnect
  let localSse: EventSource | null = null;
  const connectSSE = () => {
    try {
      if (localSse) {
        localSse.close();
      }
      localSse = new EventSource('/api/events');
      localSse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === 'CUSTOM_AUDIO_UPDATED' && data.audios) {
            applyServerCustomAudios(data.audios);
            return;
          }
          if (data && data.type === 'STAFF_ENDED_BREAK') {
            cancelAnnouncementsForStaff(data.nip, data.employeeName, data.sessionId);
            if (Array.isArray(data.sessions)) {
              reconcileSessionCollection(data.sessions, data.lastResetTime || 0, true);
            }
            return;
          }
          if (data && Array.isArray(data.sessions)) {
            if (typeof data.serverTime === 'number') {
              serverClockSkewMs = data.serverTime - Date.now();
            }
            if (typeof data.lastUpdated === 'number') {
              latestServerUpdateTimestamp = data.lastUpdated;
            }
            reconcileSessionCollection(data.sessions, data.lastResetTime || 0, true);
            if (Array.isArray(data.employees)) {
              if (JSON.stringify(data.employees) !== JSON.stringify(memoryEmployees)) {
                memoryEmployees = data.employees;
                updateEmployeeMap(data.employees);
                localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(data.employees));
                notifySubscribers();
              }
            }
          } else {
            fetchServerState(true);
          }
        } catch {
          fetchServerState(true);
        }
      };

      localSse.onerror = () => {
        localSse?.close();
        setTimeout(connectSSE, 2000);
      };
    } catch {
      setTimeout(connectSSE, 3000);
    }
  };

  connectSSE();

  // Instant refresh when user returns to tab / unlocks smartphone screen
  const triggerInstantReactivate = () => {
    fetchServerState(true);
  };

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      triggerInstantReactivate();
    }
  });
  window.addEventListener('focus', triggerInstantReactivate);
  window.addEventListener('pageshow', triggerInstantReactivate);
  window.addEventListener('online', triggerInstantReactivate);

  // Automatic authoritative server refresh strictly every 10 seconds to eliminate time errors
  setInterval(() => {
    secondsUntilRefresh--;
    if (secondsUntilRefresh <= 0) {
      secondsUntilRefresh = AUTO_REFRESH_INTERVAL_SEC;
      notifyAutoRefreshListeners(0, lastSyncTimestamp);
      fetchServerState(true);
    } else {
      notifyAutoRefreshListeners(secondsUntilRefresh, lastSyncTimestamp);
    }
  }, 1000);

  // Initialize Global MQTT Cloud Synchronization for peer-to-peer redundancy
  try {
    cloudSync.init();
  } catch (e) {
    console.debug('CloudSync init note:', e);
  }
}

export function broadcastCurrentStateToCloud(): void {
  cloudSync.publishState(getAllSessions(), memoryEmployees, localLastResetTime);
}

// Auto-trigger on module load in client
if (typeof window !== 'undefined') {
  initRealtimeSync();
}

// ---------------- Employees Management ---------------- //
export function getEmployees(): Employee[] {
  if (memoryEmployees.length > 0) {
    return memoryEmployees;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryEmployees = parsed;
        return parsed;
      }
    }
  } catch {}
  memoryEmployees = DEFAULT_EMPLOYEES;
  return DEFAULT_EMPLOYEES;
}

export function saveEmployees(employees: Employee[]): void {
  const sanitized = employees.map((e) => {
    if (
      e.jobTitle &&
      (e.jobTitle.toUpperCase() === 'SALES EXECUTIVE' ||
        e.jobTitle.toUpperCase().includes('SALES EXECUTIVE'))
    ) {
      return { ...e, jobTitle: 'SMT', department: 'SMT', storeZone: 'Informa Alam Sutera' };
    }
    return { ...e, storeZone: 'Informa Alam Sutera' };
  });

  memoryEmployees = sanitized;
  updateEmployeeMap(sanitized);
  localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(sanitized));
  syncChannel?.postMessage({ type: 'EMPLOYEES_UPDATED' });
  notifySubscribers();

  // Post to server
  fetch('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitized),
  }).catch((e) => console.error(e));
}

export function resetEmployeesToDefault(): Employee[] {
  memoryEmployees = DEFAULT_EMPLOYEES;
  updateEmployeeMap(DEFAULT_EMPLOYEES);
  localStorage.removeItem(STORAGE_KEYS.EMPLOYEES);
  syncChannel?.postMessage({ type: 'EMPLOYEES_UPDATED' });
  notifySubscribers();

  fetch('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DEFAULT_EMPLOYEES),
  }).catch((e) => console.error(e));

  return DEFAULT_EMPLOYEES;
}

export function findEmployeeByNip(nip: string): Employee | undefined {
  if (!nip) return undefined;
  const trimmed = nip.trim();

  // Fast O(1) hash table lookup for 250+ employees
  const direct = employeeNipMap.get(trimmed);
  if (direct) return direct;

  const num = parseInt(trimmed, 10);
  if (!isNaN(num)) {
    const byNum = employeeNipMap.get(String(num));
    if (byNum) return byNum;
  }

  const employees = getEmployees();
  return employees.find((e) => e.nip === trimmed || e.nip === String(parseInt(trimmed, 10)));
}

// ---------------- Break Sessions Management ---------------- //
export function getAllSessions(): BreakSession[] {
  if (memorySessions.length > 0) {
    return memorySessions;
  }
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (data) {
      memorySessions = JSON.parse(data);
      return memorySessions;
    }
  } catch {}
  return [];
}

export function saveSessions(sessions: BreakSession[]): void {
  memorySessions = sessions;
  try {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  } catch {}
  syncChannel?.postMessage({ type: 'SESSIONS_UPDATED', timestamp: Date.now() });
  notifySubscribers();

  // Instant real-time broadcast to all other phones & managers across the internet
  cloudSync.publishState(sessions, memoryEmployees, localLastResetTime);

  // Also sync to local backend if running in full-stack mode
  fetch('/api/sessions/sync-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions, lastResetTime: localLastResetTime }),
  }).catch(() => {});
}

export function getTodaySessions(): BreakSession[] {
  const today = getTodayDateString();
  const now = getSynchronizedNow();
  return getAllSessions().filter((s) => {
    // Today's breaks
    if (s.date === today) return true;
    // Any active break currently ongoing (within last 16 hours) must ALWAYS be visible
    if (s.endTime === null && now - s.startTime < 16 * 60 * 60 * 1000) return true;
    return false;
  });
}

export function getStaffDailySummary(nip: string, targetDate: string = getTodayDateString()): DailyStaffSummary {
  const allSessions = getAllSessions();
  const staffSessions = allSessions
    .filter((s) => s.nip === nip && (s.date === targetDate || s.endTime === null))
    .sort((a, b) => a.startTime - b.startTime);

  let totalMinutesUsed = 0;
  let activeSession: BreakSession | null = null;
  const now = getSynchronizedNow();

  staffSessions.forEach((s) => {
    if (s.endTime) {
      const duration = Math.round((s.endTime - s.startTime) / (1000 * 60));
      totalMinutesUsed += Math.max(1, duration);
    } else {
      activeSession = s;
      const liveDuration = Math.round((now - s.startTime) / (1000 * 60));
      totalMinutesUsed += Math.max(0, liveDuration);
    }
  });

  const breakCount = staffSessions.length;
  const remainingMinutes = Math.max(0, 120 - totalMinutesUsed);

  return {
    date: targetDate,
    nip,
    sessions: staffSessions,
    totalMinutesUsed,
    remainingMinutes,
    breakCount,
    isCurrentlyOnBreak: activeSession !== null,
    activeSession,
  };
}

export function getBreakSessionLabel(sessionNumber: number): string {
  if (sessionNumber === 1) return 'Istirahat Pertama (Sesi 1)';
  if (sessionNumber === 2) return 'Istirahat Kedua (Sesi 2)';
  return `Istirahat ke-${sessionNumber} (Sesi ${sessionNumber})`;
}

// Start Break (Optimistic + Backend Central Server Sync)
export function startStaffBreak(employee: Employee): { success: boolean; message: string; session?: BreakSession } {
  const today = getTodayDateString();
  const summary = getStaffDailySummary(employee.nip, today);

  if (summary.isCurrentlyOnBreak) {
    return {
      success: false,
      message: 'Anda sedang dalam sesi istirahat aktif! Selesaikan sesi ini terlebih dahulu.',
    };
  }

  if (summary.breakCount >= 2) {
    return {
      success: false,
      message: 'Batas istirahat harian tercapai! Anda sudah mengambil jatah 2x istirahat (Sesi 1 dan Sesi 2) hari ini.',
    };
  }

  if (summary.remainingMinutes <= 0) {
    return {
      success: false,
      message: 'Total kuota istirahat Anda untuk hari ini (120 menit) telah habis.',
    };
  }

  const effectiveJobTitle =
    employee.jobTitle.toUpperCase() === 'SALES EXECUTIVE' ? 'SMT' : employee.jobTitle;

  const currentSessionNumber = summary.breakCount + 1;
  const canonicalId = 'brk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = getSynchronizedNow();

  const newSession: BreakSession = {
    id: canonicalId,
    nip: employee.nip,
    employeeName: employee.name,
    jobTitle: effectiveJobTitle,
    department: employee.department,
    storeZone: 'Informa Alam Sutera',
    date: today,
    startTime: now,
    endTime: null,
    durationMinutes: 0,
    sessionNumber: currentSessionNumber,
    alarmPlayed: false,
    warningPlayed: false,
    overduePlayed: false,
  };

  const all = getAllSessions();
  all.unshift(newSession);
  saveSessions(all);

  // Sync with central server using canonical ID & master clock authority
  fetch('/api/sessions/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nip: employee.nip,
      id: canonicalId,
      startTime: now,
      sessionNumber: currentSessionNumber,
      employeeName: employee.name,
      jobTitle: effectiveJobTitle,
      department: employee.department,
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.session) {
        reconcileSessionCollection([data.session], 0, true);
        fetchServerState(true);
      }
    })
    .catch((err) => console.error('Failed to sync start session to server:', err));

  const sessionLabel = currentSessionNumber === 1 ? 'Istirahat Pertama (Sesi 1)' : 'Istirahat Kedua (Sesi 2)';

  return {
    success: true,
    message: `${sessionLabel} berhasil dimulai! Sisa kuota harian: ${summary.remainingMinutes} menit.`,
    session: newSession,
  };
}

// End Break (Optimistic + Backend Central Server Sync)
export function endStaffBreak(nip: string): { success: boolean; message: string; durationMinutes?: number } {
  const all = getAllSessions();
  const cleanNip = String(nip).trim();

  // Find all active sessions for this employee
  const matchingIndices: number[] = [];
  all.forEach((s, idx) => {
    const matchesNip =
      s.nip === cleanNip ||
      (!isNaN(parseInt(cleanNip, 10)) && parseInt(s.nip, 10) === parseInt(cleanNip, 10));
    if (matchesNip && s.endTime === null) {
      matchingIndices.push(idx);
    }
  });

  if (matchingIndices.length === 0) {
    return {
      success: false,
      message: 'Tidak ditemukan sesi istirahat aktif untuk diselesaikan.',
    };
  }

  const now = getSynchronizedNow();
  let firstDuration = 0;
  let employeeName = '';
  let sessionId = '';

  matchingIndices.forEach((idx) => {
    const session = all[idx];
    employeeName = session.employeeName;
    sessionId = session.id;
    const durationMs = now - session.startTime;
    const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));
    if (!firstDuration) firstDuration = durationMinutes;

    all[idx] = {
      ...session,
      endTime: now,
      durationMinutes,
    };
  });

  saveSessions(all);

  // 1. CANCEL ANY PENDING ANNOUNCEMENTS FOR THIS EMPLOYEE IMMEDIATELY!
  cancelAnnouncementsForStaff(cleanNip, employeeName, sessionId);

  // 2. Broadcast on syncChannel to immediately cancel on other open tabs
  syncChannel?.postMessage({
    type: 'STAFF_ENDED_BREAK',
    nip: cleanNip,
    employeeName,
    sessionId,
    timestamp: now,
  });

  // 3. Sync with central server
  fetch('/api/sessions/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nip: cleanNip, sessionId, endTime: now }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data && data.session) {
        reconcileSessionCollection([data.session], 0, false);
      }
      fetchServerState(true);
    })
    .catch((err) => console.error('Failed to sync end session to server:', err));

  return {
    success: true,
    message: `Istirahat selesai! Durasi sesi ini: ${firstDuration} menit. Selamat kembali beraktivitas di floor!`,
    durationMinutes: firstDuration,
  };
}

// ---------------- Manager Time Adjustment & Simulation ---------------- //
/**
 * Allows Manager to adjust elapsed minutes or jump to specific times
 * (e.g. 34:50 for 35m alarm test, 39:50 for 40m test, 40:50 for >40m test).
 * Synchronizes immediately with central server so all connected devices hear and see the update!
 */
export async function updateSessionElapsedMinutes(
  sessionId: string,
  targetElapsedMinutes: number,
  resetAlarms: boolean = true
): Promise<{ success: boolean; message: string }> {
  const all = getAllSessions();
  const idx = all.findIndex((s) => s.id === sessionId);

  if (idx === -1) {
    return { success: false, message: 'Sesi istirahat tidak ditemukan.' };
  }

  const now = getSynchronizedNow();
  const newStartTime = now - Math.round(targetElapsedMinutes * 60 * 1000);
  const currentElapsedSec = Math.floor((now - newStartTime) / 1000);

  let warningPlayed = all[idx].warningPlayed;
  let alarmPlayed = all[idx].alarmPlayed;
  let overduePlayed = all[idx].overduePlayed;

  if (resetAlarms || currentElapsedSec < 35 * 60) {
    warningPlayed = false;
    alarmPlayed = false;
    overduePlayed = false;
  } else if (currentElapsedSec < 40 * 60) {
    alarmPlayed = false;
    overduePlayed = false;
  } else if (currentElapsedSec < 41 * 60) {
    overduePlayed = false;
  }

  all[idx] = {
    ...all[idx],
    startTime: newStartTime,
    warningPlayed,
    alarmPlayed,
    overduePlayed,
  };

  saveSessions(all);

  try {
    await fetch('/api/sessions/update-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        elapsedMinutes: targetElapsedMinutes,
        resetAlarms,
      }),
    });
  } catch (err) {
    console.error('Server sync error on update-time:', err);
  }

  return {
    success: true,
    message: `Waktu disetel ke ${Math.floor(targetElapsedMinutes)} menit (${Math.round((targetElapsedMinutes % 1) * 60)} dtk).`,
  };
}

// Mark 40-minute audio played
export function markAlarmPlayed(sessionId: string): void {
  const all = getAllSessions();
  const idx = all.findIndex((s) => s.id === sessionId);
  if (idx !== -1) {
    all[idx].alarmPlayed = true;
    saveSessions(all);
    fetch('/api/sessions/mark-played', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, type: 'alarm' }),
    }).catch(() => {});
  }
}

// Mark 35-minute warning audio played (5 menit lagi habis)
export function markWarningPlayed(sessionId: string): void {
  const all = getAllSessions();
  const idx = all.findIndex((s) => s.id === sessionId);
  if (idx !== -1) {
    all[idx].warningPlayed = true;
    saveSessions(all);
    fetch('/api/sessions/mark-played', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, type: 'warning' }),
    }).catch(() => {});
  }
}

// Mark overdue alarm played (lewat 40 menit)
export function markOverduePlayed(sessionId: string): void {
  const all = getAllSessions();
  const idx = all.findIndex((s) => s.id === sessionId);
  if (idx !== -1) {
    all[idx].overduePlayed = true;
    saveSessions(all);
    fetch('/api/sessions/mark-played', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, type: 'overdue' }),
    }).catch(() => {});
  }
}

export function resetTodaySessions(): Promise<void> {
  const today = getTodayDateString();
  const resetNow = Date.now();
  localLastResetTime = resetNow;
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_RESET_TIME, String(resetNow));
  } catch {}
  const remaining = getAllSessions().filter((s) => s.date !== today);
  saveSessions(remaining);
  pushToCloudDirect(remaining, resetNow);
  return fetch('/api/sessions/reset-today', { method: 'POST' }).then(() => {}).catch(() => {});
}

// ---------------- Cleanse Fake Demo Sessions ---------------- //
export function seedInitialDemoIfEmpty(): void {
  try {
    const existing = getAllSessions();
    const cleanSessions = existing.filter((s) => !s.id.startsWith('demo_'));
    if (cleanSessions.length !== existing.length) {
      saveSessions(cleanSessions);
    }
  } catch (e) {
    console.error(e);
  }
}

export function clearAllSessions(): void {
  const resetNow = Date.now();
  localLastResetTime = resetNow;
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_RESET_TIME, String(resetNow));
  } catch {}
  saveSessions([]);
  try {
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
  } catch {}
  pushToCloudDirect([], resetNow);
  fetch('/api/sessions/clear-all', { method: 'POST' }).catch(() => {});
}

// ---------------- CSV Importer ---------------- //
export function parseEmployeesFromCSV(csvText: string): Employee[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const parsedEmployees: Employee[] = [];

  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (
      lines[i].toLowerCase().includes('employee') ||
      lines[i].toLowerCase().includes('nip') ||
      lines[i].toLowerCase().includes('name')
    ) {
      headerIdx = i;
      break;
    }
  }

  const rows = lines.slice(headerIdx + 1);

  rows.forEach((row) => {
    const parts = row.split(',').map((p) => p.replace(/^["'\s]+|["'\s]+$/g, ''));
    const cleanParts = parts[0] === '' ? parts.slice(1) : parts;
    if (cleanParts.length >= 4) {
      const nip = cleanParts[0].trim();
      const name = cleanParts[1].trim();
      let jobTitle = cleanParts[2].trim();
      const birthDate = cleanParts[3].trim();

      if (nip && name) {
        if (
          jobTitle.toUpperCase() === 'SALES EXECUTIVE' ||
          jobTitle.toUpperCase().includes('SALES EXECUTIVE')
        ) {
          jobTitle = 'SMT';
        }

        const bParts = birthDate.split('/');
        let password = '199001';
        if (bParts.length === 3) {
          password = `${bParts[2]}${bParts[1].padStart(2, '0')}`;
        }

        const upper = jobTitle.toUpperCase();
        const role =
          upper.includes('MANAGER') || upper.includes('SUPERVISOR') || upper.includes('DEPUTY')
            ? 'manager'
            : upper.includes('HR')
            ? 'hrd'
            : 'staff';

        const dept =
          upper.includes('SMT') || upper.includes('SALES')
            ? 'SMT'
            : upper.includes('PRODUCT')
            ? 'Product Specialist'
            : upper.includes('LOGISTIC')
            ? 'Logistik & Gudang'
            : upper.includes('CASHIER')
            ? 'Kasir & Front Office'
            : 'Back Office Retail';

        parsedEmployees.push({
          nip,
          name: cleanEmployeeName(name),
          jobTitle,
          department: dept,
          storeZone: 'Informa Alam Sutera',
          birthDate,
          password,
          role,
        });
      }
    }
  });

  return parsedEmployees;
}
