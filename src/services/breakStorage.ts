// Break sessions storage and business logic service with Central Server Synchronization
// Syncs seamlessly across multiple phones (HP Manager & HP Staff) and web browser tabs in real-time
import { Employee, BreakSession, DailyStaffSummary } from '../types';
import { DEFAULT_EMPLOYEES, cleanEmployeeName } from '../data/defaultEmployees';

const STORAGE_KEYS = {
  EMPLOYEES: 'informa_employees_v1',
  SESSIONS: 'informa_break_sessions_v1',
  SERVER_SYNC_TIME: 'informa_sync_time_v1',
};

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

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------- Initialization & Server Sync ---------------- //
function loadInitialCache() {
  if (typeof window === 'undefined') return;
  try {
    const savedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (savedSessions) {
      memorySessions = JSON.parse(savedSessions);
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

export async function fetchServerState(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const [sessRes, empRes] = await Promise.all([
      fetch('/api/sessions').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/employees').then((r) => (r.ok ? r.json() : null)),
    ]);

    let changed = false;

    if (Array.isArray(sessRes)) {
      // Check if session changed
      if (JSON.stringify(sessRes) !== JSON.stringify(memorySessions)) {
        memorySessions = sessRes;
        localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessRes));
        changed = true;
      }
    }

    if (Array.isArray(empRes) && empRes.length > 0) {
      if (JSON.stringify(empRes) !== JSON.stringify(memoryEmployees)) {
        memoryEmployees = empRes;
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(empRes));
        changed = true;
      }
    }

    if (changed) {
      notifySubscribers();
    }
  } catch (err) {
    console.debug('Background server sync warning:', err);
  }
}

// Start Real-Time Sync loop (EventSource + Fallback Polling)
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

  // Connect Server-Sent Events (SSE)
  try {
    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = () => {
      fetchServerState();
    };
    eventSource.onerror = () => {
      // SSE will automatically retry in browser
    };
  } catch (e) {
    console.warn('SSE not supported, using high-frequency polling', e);
  }

  // Polling fallback every 1.5 seconds so all mobile devices stay in lockstep
  setInterval(() => {
    fetchServerState();
  }, 1500);
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
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  syncChannel?.postMessage({ type: 'SESSIONS_UPDATED', timestamp: Date.now() });
  notifySubscribers();
}

export function getTodaySessions(): BreakSession[] {
  const today = getTodayDateString();
  return getAllSessions().filter((s) => s.date === today);
}

export function getStaffDailySummary(nip: string, targetDate: string = getTodayDateString()): DailyStaffSummary {
  const allSessions = getAllSessions();
  const staffSessions = allSessions
    .filter((s) => s.nip === nip && s.date === targetDate)
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

  const newSession: BreakSession = {
    id: 'brk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    nip: employee.nip,
    employeeName: employee.name,
    jobTitle: effectiveJobTitle,
    department: employee.department,
    storeZone: 'Informa Alam Sutera',
    date: today,
    startTime: Date.now(),
    endTime: null,
    durationMinutes: 0,
    sessionNumber: currentSessionNumber,
    alarmPlayed: false,
    warningPlayed: false,
    overduePlayed: false,
  };

  const all = getAllSessions();
  all.push(newSession);
  saveSessions(all);

  // Sync with central server
  fetch('/api/sessions/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nip: employee.nip }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.session && data.session.id) {
        // Replace temporary local ID with server session if needed
        const currentList = getAllSessions();
        const foundIdx = currentList.findIndex((s) => s.id === newSession.id);
        if (foundIdx !== -1) {
          currentList[foundIdx] = data.session;
          saveSessions(currentList);
        }
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
  const today = getTodayDateString();
  const all = getAllSessions();
  const sessionIndex = all.findIndex((s) => s.nip === nip && s.date === today && s.endTime === null);

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
    body: JSON.stringify({ nip, sessionId: session.id }),
  }).catch((err) => console.error('Failed to sync end session to server:', err));

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
  saveSessions(remaining);
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
  memorySessions = [];
  localStorage.removeItem(STORAGE_KEYS.SESSIONS);
  syncChannel?.postMessage({ type: 'SESSIONS_UPDATED', timestamp: Date.now() });
  notifySubscribers();
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
