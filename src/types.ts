export type Role = 'staff' | 'manager' | 'hrd';

export interface Employee {
  nip: string;
  name: string;
  jobTitle: string;
  department: string;
  storeZone: string; // "Informa Alam Sutera"
  birthDate: string; // DD/MM/YYYY
  password: string;  // YYYYMM
  role: Role;
}

export interface BreakSession {
  id: string;
  nip: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  storeZone: string;
  date: string; // YYYY-MM-DD
  startTime: number; // timestamp in ms
  endTime: number | null; // timestamp in ms or null if currently active
  durationMinutes: number; // calculated once ended, or live
  sessionNumber: number; // 1 or 2
  alarmPlayed: boolean; // whether Audio 1 (tepat 40 mnt) has played
  warningPlayed?: boolean; // whether Audio 2 (5 mnt lagi habis / menit 35) has played
  overduePlayed?: boolean; // whether Audio 3 (lewat 40 mnt) has played
}

export interface DailyStaffSummary {
  date: string;
  nip: string;
  sessions: BreakSession[];
  totalMinutesUsed: number;
  remainingMinutes: number; // 120 - totalMinutesUsed
  breakCount: number; // max 2
  isCurrentlyOnBreak: boolean;
  activeSession: BreakSession | null;
}
