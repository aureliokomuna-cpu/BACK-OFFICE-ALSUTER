// Break sessions storage and business logic service with Central Server Synchronization
// Syncs seamlessly across multiple phones (HP Manager & HP Staff) and web browser tabs in real-time
import { Employee, BreakSession, DailyStaffSummary } from '../types';
import { DEFAULT_EMPLOYEES, cleanEmployeeName } from '../data/defaultEmployees';
import { cloudSync } from './cloudSyncService';

const STORAGE_KEYS = {
  EMPLOYEES: 'informa_employees_v1',
  SESSIONS: 'informa_break_sessions_v1',
  SERVER_SYNC_TIME: 'informa_sync_time_v1',
};

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
    await fetch('/api/sessions/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions, lastResetTime: lastResetTime || 0 }),
    });

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
      // Clean up ancient abandoned breaks (> 24 hours ago)
      const now = Date.now();
      memorySessions = parsed.filter((s) => {
        if (s.endTime === null && now - s.startTime > 24 * 3600 * 1000) return false;
        return true;
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
  } catch {}
}

loadInitialCache();

export function applyAuthoritativeServerSessions(serverSessions: BreakSession[]) {
  if (!Array.isArray(serverSessions)) return;

  const now = Date.now();
  const map = new Map<string, BreakSession>();

  // Populate from server (authoritative)
  for (const s of serverSessions) {
    // Exclude abandoned breaks over 24h old
    if (s.endTime === null && now - s.startTime > 24 * 3600 * 1000) continue;
    map.set(s.id, s);
  }

  // Preserve any local active session that was created within the last 8 seconds
  // so the user experiences zero flicker before the server roundtrip finishes
  for (const l of memorySessions) {
    if (l.endTime === null && now - l.startTime < 8000 && !map.has(l.id)) {
      map.set(l.id, l);
    }
  }

  const merged = Array.from(map.values()).sort((a, b) => b.startTime - a.startTime);

  // Check if anything actually changed
  if (JSON.stringify(merged) !== JSON.stringify(memorySessions)) {
    memorySessions = merged;
    try {
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(merged));
    } catch {}
    notifySubscribers();
  }
}

export function reconcileWithCloudSessions(cloudSessions: BreakSession[]): void {
  if (!Array.isArray(cloudSessions)) return;

  const now = Date.now();
  const sessionMap = new Map<string, BreakSession>();

  // 1. Existing local sessions
  for (const s of memorySessions) {
    if (s.endTime === null && now - s.startTime > 24 * 3600 * 1000) continue;
    sessionMap.set(s.id, s);
  }

  // 2. Merge with incoming Cloud / MQTT sessions
  let hasChanges = false;
  for (const remote of cloudSessions) {
    if (remote.endTime === null && now - remote.startTime > 24 * 3600 * 1000) continue;

    const local = sessionMap.get(remote.id);
    if (!local) {
      sessionMap.set(remote.id, remote);
      hasChanges = true;
    } else {
      // If either has finished (endTime is set), finished state always wins
      if (remote.endTime !== null && local.endTime === null) {
        sessionMap.set(remote.id, remote);
        hasChanges = true;
      } else if (local.endTime !== null && remote.endTime === null) {
        // Keep local finished
      } else {
        // Keep freshest or remote
        if (JSON.stringify(local) !== JSON.stringify(remote)) {
          sessionMap.set(remote.id, { ...local, ...remote });
          hasChanges = true;
        }
      }
    }
  }

  const merged = Array.from(sessionMap.values()).sort((a, b) => b.startTime - a.startTime);

  if (hasChanges || JSON.stringify(merged) !== JSON.stringify(memorySessions)) {
    memorySessions = merged;
    try {
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(merged));
    } catch {}
    notifySubscribers();
  }
}

// Connect CloudSync listener immediately
cloudSync.onSync((cloudSessions, cloudEmployees) => {
  if (Array.isArray(cloudSessions)) {
    reconcileWithCloudSessions(cloudSessions);
  }
  if (Array.isArray(cloudEmployees) && cloudEmployees.length > 0) {
    if (JSON.stringify(cloudEmployees) !== JSON.stringify(memoryEmployees)) {
      memoryEmployees = cloudEmployees;
      try {
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(cloudEmployees));
      } catch {}
      notifySubscribers();
    }
  }
});

export async function fetchServerState(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const [sessRes, empRes] = await Promise.all([
      fetch('/api/sessions').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/employees').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    if (Array.isArray(sessRes)) {
      applyAuthoritativeServerSessions(sessRes);
    }

    if (Array.isArray(empRes) && empRes.length > 0) {
      if (JSON.stringify(empRes) !== JSON.stringify(memoryEmployees)) {
        memoryEmployees = empRes;
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(empRes));
        notifySubscribers();
      }
    }
  } catch (err) {
    console.debug('Background server sync warning:', err);
  }
}

// Start Real-Time Sync loop (EventSource + Visibility Listener + Fallback Polling)
export function initRealtimeSync(): void {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // Immediate fetch
  fetchServerState();

  // Listen to same-device BroadcastChannel
  if (syncChannel) {
    syncChannel.onmessage = () => {
      fetchServerState();
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
          if (data && Array.isArray(data.sessions)) {
            applyAuthoritativeServerSessions(data.sessions);
            if (Array.isArray(data.employees)) {
              if (JSON.stringify(data.employees) !== JSON.stringify(memoryEmployees)) {
                memoryEmployees = data.employees;
                localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(data.employees));
                notifySubscribers();
              }
            }
          } else {
            fetchServerState();
          }
        } catch {
          fetchServerState();
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
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchServerState();
    }
  });
  window.addEventListener('focus', () => {
    fetchServerState();
  });
  window.addEventListener('pageshow', () => {
    fetchServerState();
  });

  // Short polling fallback every 1000ms so all mobile devices stay 100% in lockstep
  setInterval(() => {
    fetchServerState();
  }, 1000);

  // Initialize Global MQTT Cloud Synchronization
  try {
    cloudSync.init();
    // If local device already has active break session, announce to cloud after connection
    setTimeout(() => {
      const all = getAllSessions();
      const active = all.filter((s) => s.endTime === null);
      if (active.length > 0) {
        cloudSync.publishState(all, memoryEmployees);
      }
    }, 1500);
  } catch (e) {
    console.debug('CloudSync init note:', e);
  }
}

export function broadcastCurrentStateToCloud(): void {
  cloudSync.publishState(getAllSessions(), memoryEmployees);
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
  const employees = getEmployees();
  const trimmed = nip.trim();
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
  cloudSync.publishState(sessions, memoryEmployees);

  // Also sync to local backend if running in full-stack mode
  fetch('/api/sessions/sync-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions }),
  }).catch(() => {});
}

export function getTodaySessions(): BreakSession[] {
  const today = getTodayDateString();
  const now = Date.now();
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
  const now = Date.now();

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
  const now = Date.now();

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

  // Sync with central server using canonical ID
  fetch('/api/sessions/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nip: employee.nip,
      id: canonicalId,
      startTime: now,
      sessionNumber: currentSessionNumber,
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.session) {
        fetchServerState();
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
  // Find any active session for this employee regardless of date mismatch
  const sessionIndex = all.findIndex((s) => s.nip === nip && s.endTime === null);

  if (sessionIndex === -1) {
    return {
      success: false,
      message: 'Tidak ditemukan sesi istirahat aktif untuk diselesaikan.',
    };
  }

  const now = Date.now();
  const session = all[sessionIndex];
  const durationMs = now - session.startTime;
  const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));

  all[sessionIndex] = {
    ...session,
    endTime: now,
    durationMinutes,
  };

  saveSessions(all);

  // Sync with central server
  fetch('/api/sessions/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nip, sessionId: session.id, endTime: now }),
  })
    .then(() => fetchServerState())
    .catch((err) => console.error('Failed to sync end session to server:', err));

  return {
    success: true,
    message: `Istirahat selesai! Durasi sesi ini: ${durationMinutes} menit. Selamat kembali beraktivitas di floor!`,
    durationMinutes,
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

  const now = Date.now();
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
  const remaining = getAllSessions().filter((s) => s.date !== today);
  const resetNow = Date.now();
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
  memorySessions = [];
  localStorage.removeItem(STORAGE_KEYS.SESSIONS);
  syncChannel?.postMessage({ type: 'SESSIONS_UPDATED', timestamp: Date.now() });
  notifySubscribers();
  pushToCloudDirect([], resetNow);
  fetch('/api/sessions/reset-today', { method: 'POST' }).catch(() => {});
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
