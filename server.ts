import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DEFAULT_EMPLOYEES, cleanEmployeeName } from './src/data/defaultEmployees.js';
import { Employee, BreakSession } from './src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, 'data_store');
const DATA_FILE = path.resolve(DATA_DIR, 'informa_state.json');

const NTFY_TOPIC_URL = 'https://ntfy.sh/informa_alamsutera_sync_channel';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface ServerState {
  employees: Employee[];
  sessions: BreakSession[];
  lastUpdated: number;
}

function loadState(): ServerState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.sessions)) {
        const now = Date.now();
        // Clean out stale breaks older than 24h
        const cleanSessions = (parsed.sessions as BreakSession[]).filter((s) => {
          if (s.endTime === null && now - s.startTime > 24 * 3600 * 1000) return false;
          return true;
        });

        return {
          employees: Array.isArray(parsed.employees) && parsed.employees.length > 0 ? parsed.employees : DEFAULT_EMPLOYEES,
          sessions: cleanSessions,
          lastUpdated: parsed.lastUpdated || Date.now(),
        };
      }
    }
  } catch (err) {
    console.error('Failed reading state from disk:', err);
  }

  const initial: ServerState = {
    employees: DEFAULT_EMPLOYEES,
    sessions: [],
    lastUpdated: Date.now(),
  };
  saveState(initial);
  return initial;
}

let serverState = loadState();

function reconcileServerSessions(
  local: BreakSession[],
  remote: BreakSession[]
): { merged: BreakSession[]; localUpdated: boolean; remoteNeedsUpdate: boolean } {
  const map = new Map<string, BreakSession>();
  let localUpdated = false;
  let remoteNeedsUpdate = false;

  const now = Date.now();
  const validLocal = local.filter((s) => {
    if (s.endTime === null && now - s.startTime > 24 * 3600 * 1000) return false;
    return true;
  });

  const validRemote = remote.filter((s) => {
    if (s.endTime === null && now - s.startTime > 24 * 3600 * 1000) return false;
    return true;
  });

  for (const s of validLocal) {
    map.set(s.id, { ...s });
  }

  for (const r of validRemote) {
    const l = map.get(r.id);
    if (!l) {
      map.set(r.id, { ...r });
      localUpdated = true;
    } else {
      let merged = { ...l };
      let changed = false;

      if (r.endTime !== null && l.endTime === null) {
        merged.endTime = r.endTime;
        merged.durationMinutes = r.durationMinutes;
        changed = true;
        localUpdated = true;
      } else if (l.endTime !== null && r.endTime === null) {
        remoteNeedsUpdate = true;
      }

      if (r.alarmPlayed && !l.alarmPlayed) {
        merged.alarmPlayed = true;
        changed = true;
        localUpdated = true;
      } else if (l.alarmPlayed && !r.alarmPlayed) {
        remoteNeedsUpdate = true;
      }

      if (r.warningPlayed && !l.warningPlayed) {
        merged.warningPlayed = true;
        changed = true;
        localUpdated = true;
      } else if (l.warningPlayed && !r.warningPlayed) {
        remoteNeedsUpdate = true;
      }

      if (r.overduePlayed && !l.overduePlayed) {
        merged.overduePlayed = true;
        changed = true;
        localUpdated = true;
      } else if (l.overduePlayed && !r.overduePlayed) {
        remoteNeedsUpdate = true;
      }

      if (changed) {
        map.set(r.id, merged);
      }
    }
  }

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

function saveState(state: ServerState) {
  try {
    state.lastUpdated = Date.now();
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
    notifySseClients();

    // Broadcast signal via ntfy.sh
    fetch(NTFY_TOPIC_URL, {
      method: 'POST',
      body: JSON.stringify({ type: 'SYNC', lastUpdated: state.lastUpdated }),
    }).catch(() => {});
  } catch (err) {
    console.error('Failed writing state to disk:', err);
  }
}

// ---------------- Server-Sent Events (SSE) for Real-Time Multi-Device Sync ---------------- //
const sseClients = new Set<Response>();

function notifySseClients() {
  const payload = JSON.stringify({
    type: 'SYNC',
    lastUpdated: serverState.lastUpdated,
    sessions: serverState.sessions,
    employees: serverState.employees,
    sessionsCount: serverState.sessions.length,
    activeCount: serverState.sessions.filter((s) => s.endTime === null).length,
  });

  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Always compute date in WIB (Asia/Jakarta)
function getTodayString(): string {
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

async function startServer() {
  const app = express();

  // Permissive CORS for cross-device webviews & PWA
  app.use((req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // SSE Stream endpoint for real-time live sync across devices
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    sseClients.add(res);

    // Initial event with full state
    const initialPayload = JSON.stringify({
      type: 'SYNC',
      lastUpdated: serverState.lastUpdated,
      sessions: serverState.sessions,
      employees: serverState.employees,
      sessionsCount: serverState.sessions.length,
      activeCount: serverState.sessions.filter((s) => s.endTime === null).length,
    });
    res.write(`data: ${initialPayload}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 5000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // Health / timestamp check
  app.get('/api/status', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      lastUpdated: serverState.lastUpdated,
      today: getTodayString(),
      activeBreaks: serverState.sessions.filter((s) => s.endTime === null).length,
      totalSessions: serverState.sessions.length,
      connectedClients: sseClients.size,
    });
  });

  // Get Employees
  app.get('/api/employees', (req: Request, res: Response) => {
    res.json(serverState.employees);
  });

  // Save Employees
  app.post('/api/employees', (req: Request, res: Response) => {
    const list = req.body;
    if (Array.isArray(list)) {
      serverState.employees = list;
      saveState(serverState);
      res.json({ success: true, count: list.length });
    } else {
      res.status(400).json({ success: false, message: 'Invalid employees array' });
    }
  });

  // Get Sessions (optional ?today=1 or ?nip=...)
  app.get('/api/sessions', (req: Request, res: Response) => {
    const { today, nip } = req.query;
    let list = serverState.sessions;

    if (today === '1' || today === 'true') {
      const todayStr = getTodayString();
      list = list.filter((s) => s.date === todayStr || s.endTime === null);
    }
    if (typeof nip === 'string' && nip.trim()) {
      list = list.filter((s) => s.nip === nip.trim());
    }

    res.json(list);
  });

  // Batch sync sessions across instances
  app.post('/api/sessions/sync-all', (req: Request, res: Response) => {
    const { sessions } = req.body;
    if (Array.isArray(sessions)) {
      const { merged, localUpdated } = reconcileServerSessions(serverState.sessions, sessions);
      if (localUpdated) {
        serverState.sessions = merged;
        saveState(serverState);
      }
      return res.json({ success: true, count: serverState.sessions.length, sessions: serverState.sessions });
    }
    res.status(400).json({ success: false, message: 'Invalid sessions payload' });
  });

  // Start Break Session (Canonical ID supported)
  app.post('/api/sessions/start', (req: Request, res: Response) => {
    const { nip, id, startTime, sessionNumber } = req.body;
    if (!nip) {
      return res.status(400).json({ success: false, message: 'NIP wajib diisi.' });
    }

    const cleanNip = String(nip).trim();
    const employee = serverState.employees.find(
      (e) =>
        e.nip === cleanNip ||
        (!isNaN(parseInt(cleanNip, 10)) && parseInt(e.nip, 10) === parseInt(cleanNip, 10))
    );
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Karyawan tidak ditemukan.' });
    }

    const today = getTodayString();
    const staffSessionsToday = serverState.sessions.filter((s) => s.nip === employee.nip && (s.date === today || s.endTime === null));

    // Check if already currently on break
    const active = staffSessionsToday.find((s) => s.endTime === null);
    if (active) {
      return res.json({
        success: true,
        message: 'Anda sedang dalam sesi istirahat aktif.',
        session: active,
      });
    }

    const completedToday = staffSessionsToday.filter((s) => s.endTime !== null);
    if (completedToday.length >= 2) {
      return res.status(400).json({
        success: false,
        message: 'Batas istirahat harian tercapai! Anda sudah mengambil jatah 2x istirahat hari ini.',
      });
    }

    const currentSessionNumber = typeof sessionNumber === 'number' ? sessionNumber : completedToday.length + 1;
    const effectiveJobTitle =
      employee.jobTitle.toUpperCase() === 'SALES EXECUTIVE' ? 'SMT' : employee.jobTitle;

    const newSessionId = typeof id === 'string' && id.startsWith('brk_')
      ? id
      : 'brk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    const now = typeof startTime === 'number' ? startTime : Date.now();

    const newSession: BreakSession = {
      id: newSessionId,
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

    serverState.sessions.push(newSession);
    saveState(serverState);

    const sessionLabel = currentSessionNumber === 1 ? 'Istirahat Pertama (Sesi 1)' : 'Istirahat Kedua (Sesi 2)';
    res.json({
      success: true,
      message: `${sessionLabel} berhasil dimulai!`,
      session: newSession,
    });
  });

  // End Break Session
  app.post('/api/sessions/end', (req: Request, res: Response) => {
    const { nip, sessionId, endTime } = req.body;
    const today = getTodayString();

    const idx = serverState.sessions.findIndex((s) => {
      if (sessionId) return s.id === sessionId;
      if (nip) return s.nip === String(nip).trim() && s.endTime === null;
      return false;
    });

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: 'Tidak ditemukan sesi istirahat aktif untuk diselesaikan.',
      });
    }

    const session = serverState.sessions[idx];

    // If already ended, return existing completed session
    if (session.endTime !== null) {
      return res.json({
        success: true,
        message: `Istirahat selesai! Durasi sesi: ${session.durationMinutes} menit.`,
        session,
        durationMinutes: session.durationMinutes,
      });
    }

    const finishTime = typeof endTime === 'number' ? endTime : Date.now();
    const durationMs = finishTime - session.startTime;
    const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));

    serverState.sessions[idx] = {
      ...session,
      endTime: finishTime,
      durationMinutes,
    };
    saveState(serverState);

    res.json({
      success: true,
      message: `Istirahat selesai! Durasi sesi: ${durationMinutes} menit.`,
      session: serverState.sessions[idx],
      durationMinutes,
    });
  });

  // Manager Edit Waktu & Fast Forward (Simulation for Testing Automations)
  app.post('/api/sessions/update-time', (req: Request, res: Response) => {
    const { sessionId, newStartTime, elapsedMinutes, resetAlarms } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID diperlukan.' });
    }

    const idx = serverState.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Sesi istirahat tidak ditemukan.' });
    }

    const session = serverState.sessions[idx];
    const now = Date.now();
    let calculatedStartTime = session.startTime;

    if (typeof elapsedMinutes === 'number') {
      calculatedStartTime = now - Math.round(elapsedMinutes * 60 * 1000);
    } else if (typeof newStartTime === 'number') {
      calculatedStartTime = newStartTime;
    }

    const currentElapsedSec = Math.floor((now - calculatedStartTime) / 1000);

    // If resetAlarms is requested or automatically reset based on elapsed time:
    let warningPlayed = session.warningPlayed;
    let alarmPlayed = session.alarmPlayed;
    let overduePlayed = session.overduePlayed;

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

    serverState.sessions[idx] = {
      ...session,
      startTime: calculatedStartTime,
      warningPlayed,
      alarmPlayed,
      overduePlayed,
      durationMinutes: session.endTime ? Math.max(1, Math.round((session.endTime - calculatedStartTime) / 60000)) : 0,
    };

    saveState(serverState);

    res.json({
      success: true,
      message: `Waktu berhasil diperbarui! Berjalan ${Math.floor(currentElapsedSec / 60)}m ${currentElapsedSec % 60}s.`,
      session: serverState.sessions[idx],
    });
  });

  // Mark played flag
  app.post('/api/sessions/mark-played', (req: Request, res: Response) => {
    const { sessionId, type } = req.body; // type: 'warning' | 'alarm' | 'overdue'
    const idx = serverState.sessions.findIndex((s) => s.id === sessionId);
    if (idx !== -1) {
      if (type === 'warning') serverState.sessions[idx].warningPlayed = true;
      if (type === 'alarm') serverState.sessions[idx].alarmPlayed = true;
      if (type === 'overdue') serverState.sessions[idx].overduePlayed = true;
      saveState(serverState);
      return res.json({ success: true });
    }
    res.status(404).json({ success: false });
  });

  // Reset Today's Sessions (for manager test clean-up)
  app.post('/api/sessions/reset-today', (req: Request, res: Response) => {
    const today = getTodayString();
    serverState.sessions = serverState.sessions.filter((s) => s.date !== today);
    saveState(serverState);
    res.json({ success: true, message: 'Data istirahat hari ini berhasil direset.' });
  });

  // ---------------- Frontend Integration ---------------- //
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Informa Sync Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
