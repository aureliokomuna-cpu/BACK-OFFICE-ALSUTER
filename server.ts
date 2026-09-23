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
        return {
          employees: Array.isArray(parsed.employees) && parsed.employees.length > 0 ? parsed.employees : DEFAULT_EMPLOYEES,
          sessions: parsed.sessions,
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

function saveState(state: ServerState) {
  try {
    state.lastUpdated = Date.now();
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
    notifySseClients();
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

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // SSE Stream endpoint
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);

    // Initial event
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', lastUpdated: serverState.lastUpdated })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 20000);

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
      list = list.filter((s) => s.date === todayStr);
    }
    if (typeof nip === 'string' && nip.trim()) {
      list = list.filter((s) => s.nip === nip.trim());
    }

    res.json(list);
  });

  // Start Break Session
  app.post('/api/sessions/start', (req: Request, res: Response) => {
    const { nip } = req.body;
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
    const staffSessionsToday = serverState.sessions.filter((s) => s.nip === employee.nip && s.date === today);

    // Check if currently on break
    const active = staffSessionsToday.find((s) => s.endTime === null);
    if (active) {
      return res.status(400).json({
        success: false,
        message: 'Anda sedang dalam sesi istirahat aktif! Selesaikan sesi ini terlebih dahulu.',
        session: active,
      });
    }

    if (staffSessionsToday.length >= 2) {
      return res.status(400).json({
        success: false,
        message: 'Batas istirahat harian tercapai! Anda sudah mengambil jatah 2x istirahat hari ini.',
      });
    }

    const currentSessionNumber = staffSessionsToday.length + 1;
    const effectiveJobTitle =
      employee.jobTitle.toUpperCase() === 'SALES EXECUTIVE' ? 'SMT' : employee.jobTitle;

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
    const { nip, sessionId } = req.body;
    const today = getTodayString();

    const idx = serverState.sessions.findIndex((s) => {
      if (sessionId) return s.id === sessionId && s.endTime === null;
      if (nip) return s.nip === String(nip).trim() && s.date === today && s.endTime === null;
      return false;
    });

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: 'Tidak ditemukan sesi istirahat aktif untuk diselesaikan.',
      });
    }

    const now = Date.now();
    const session = serverState.sessions[idx];
    const durationMs = now - session.startTime;
    const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));

    serverState.sessions[idx] = {
      ...session,
      endTime: now,
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
