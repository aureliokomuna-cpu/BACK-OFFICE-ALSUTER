// Break sessions storage and business logic service with cross-tab BroadcastChannel
import { Employee, BreakSession, DailyStaffSummary } from '../types';
import { DEFAULT_EMPLOYEES, cleanEmployeeName } from '../data/defaultEmployees';

const STORAGE_KEYS = {
  EMPLOYEES: 'informa_employees_v1',
  SESSIONS: 'informa_break_sessions_v1',
};

// Initialize BroadcastChannel for instant cross-tab real-time sync
let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  syncChannel = new BroadcastChannel('informa_break_channel');
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------- Employees Management ---------------- //
export function getEmployees(): Employee[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Automatically sanitize any legacy "Sales Executive" to "SMT"
        let updated = false;
        parsed.forEach((e: Employee) => {
          if (e.name) {
            const cleanedName = cleanEmployeeName(e.name);
            if (cleanedName !== e.name) {
              e.name = cleanedName;
              updated = true;
            }
          }
          if (
            e.jobTitle &&
            (e.jobTitle.toUpperCase() === 'SALES EXECUTIVE' ||
              e.jobTitle.toUpperCase().includes('SALES EXECUTIVE'))
          ) {
            e.jobTitle = 'SMT';
            e.department = 'SMT';
            updated = true;
          }
          if (e.storeZone && e.storeZone.includes('Summarecon')) {
            e.storeZone = 'Informa Alam Sutera';
            updated = true;
          }
        });
        if (updated) {
          localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(parsed));
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load employees from localStorage:', e);
  }
  return DEFAULT_EMPLOYEES;
}

export function saveEmployees(employees: Employee[]): void {
  // Ensure Sales Executive is SMT
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
  localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(sanitized));
  syncChannel?.postMessage({ type: 'EMPLOYEES_UPDATED' });
}

export function resetEmployeesToDefault(): Employee[] {
  localStorage.removeItem(STORAGE_KEYS.EMPLOYEES);
  syncChannel?.postMessage({ type: 'EMPLOYEES_UPDATED' });
  return DEFAULT_EMPLOYEES;
}

export function findEmployeeByNip(nip: string): Employee | undefined {
  const employees = getEmployees();
  const trimmed = nip.trim();
  return employees.find((e) => e.nip === trimmed || e.nip === String(parseInt(trimmed, 10)));
}

// ---------------- Break Sessions Management ---------------- //
export function getAllSessions(): BreakSession[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to read break sessions:', e);
  }
  return [];
}

export function saveSessions(sessions: BreakSession[]): void {
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  syncChannel?.postMessage({ type: 'SESSIONS_UPDATED', timestamp: Date.now() });
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
      message: 'Total jatah istirahat harian (120 menit / 2 jam) Anda untuk hari ini sudah habis.',
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

  const sessionLabel = currentSessionNumber === 1 ? 'Istirahat Pertama (Sesi 1)' : 'Istirahat Kedua (Sesi 2)';

  return {
    success: true,
    message: `${sessionLabel} berhasil dimulai! Sisa kuota harian: ${summary.remainingMinutes} menit.`,
    session: newSession,
  };
}

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

  return {
    success: true,
    message: `Istirahat selesai! Durasi sesi ini: ${durationMinutes} menit. Selamat kembali beraktivitas di floor!`,
    durationMinutes,
  };
}

// Mark 40-minute audio played
export function markAlarmPlayed(sessionId: string): void {
  const all = getAllSessions();
  const idx = all.findIndex((s) => s.id === sessionId);
  if (idx !== -1) {
    all[idx].alarmPlayed = true;
    saveSessions(all);
  }
}

// Mark 35-minute warning audio played (5 menit lagi habis)
export function markWarningPlayed(sessionId: string): void {
  const all = getAllSessions();
  const idx = all.findIndex((s) => s.id === sessionId);
  if (idx !== -1) {
    all[idx].warningPlayed = true;
    saveSessions(all);
  }
}

// Mark overdue alarm played (lewat 40 menit)
export function markOverduePlayed(sessionId: string): void {
  const all = getAllSessions();
  const idx = all.findIndex((s) => s.id === sessionId);
  if (idx !== -1) {
    all[idx].overduePlayed = true;
    saveSessions(all);
  }
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
  localStorage.removeItem(STORAGE_KEYS.SESSIONS);
  syncChannel?.postMessage({ type: 'SESSIONS_UPDATED', timestamp: Date.now() });
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
        // Replace SALES EXECUTIVE with SMT
        if (
          jobTitle.toUpperCase() === 'SALES EXECUTIVE' ||
          jobTitle.toUpperCase().includes('SALES EXECUTIVE')
        ) {
          jobTitle = 'SMT';
        }

        // Derive password YYYYMM
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
          name,
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
