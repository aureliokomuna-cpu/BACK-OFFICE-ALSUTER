import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mqtt, { type MqttClient } from 'mqtt';
import { DEFAULT_EMPLOYEES, cleanEmployeeName } from './src/data/defaultEmployees.js';
import { Employee, BreakSession } from './src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, 'data_store');
const DATA_FILE = path.resolve(DATA_DIR, 'informa_state.json');

const SYNC_TOPIC = 'informa/alamsutera/v1/sessions_state';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface ServerState {
  employees: Employee[];
  sessions: BreakSession[];
  lastUpdated: number;
  lastResetTime?: number;
}

function cleanStaleSessions(sessions: BreakSession[]): BreakSession[] {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
  return sessions
    .filter((s) => s.startTime > sevenDaysAgo || s.endTime === null)
    .map((s) => {
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

function loadState(): ServerState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.sessions)) {
        const cleaned = cleanStaleSessions(parsed.sessions as BreakSession[]);
        return {
          employees: Array.isArray(parsed.employees) && parsed.employees.length > 0 ? parsed.employees : DEFAULT_EMPLOYEES,
          sessions: cleaned,
          lastUpdated: parsed.lastUpdated || Date.now(),
          lastResetTime: parsed.lastResetTime || 0,
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
    lastResetTime: 0,
  };
  saveState(initial);
  return initial;
}

let serverState = loadState();

function reconcileServerSessions(
  local: BreakSession[],
  remote: BreakSession[],
  resetThreshold: number = 0
): { merged: BreakSession[]; localUpdated: boolean; remoteNeedsUpdate: boolean } {
  const map = new Map<string, BreakSession>();
  let localUpdated = false;
  let remoteNeedsUpdate = false;

  const effectiveReset = Math.max(resetThreshold, serverState.lastResetTime || 0);

  const validLocal = cleanStaleSessions(local).filter((s) => {
    if (effectiveReset > 0 && s.startTime < effectiveReset) return false;
    return true;
  });

  const validRemote = cleanStaleSessions(remote).filter((s) => {
    if (effectiveReset > 0 && s.startTime < effectiveReset) return false;
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

      // 1. End time: finished always wins
      if (r.endTime !== null && l.endTime === null) {
        merged.endTime = r.endTime;
        merged.durationMinutes = r.durationMinutes;
        changed = true;
        localUpdated = true;
      } else if (l.endTime !== null && r.endTime === null) {
        remoteNeedsUpdate = true;
      }

      // 2. Start time adjustments (manager simulation/fast-forward)
      if (Math.abs(r.startTime - l.startTime) > 1000) {
        merged.startTime = r.startTime;
        changed = true;
        localUpdated = true;
      }

      // 3. Audio alarm flags: once true, stay true
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

// ---------------- Global MQTT Broker Integration for Cross-Device Sync ---------------- //
let serverMqttClient: MqttClient | null = null;
try {
  serverMqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
    clientId: 'srv_informa_' + Math.random().toString(16).slice(2),
    clean: true,
    reconnectPeriod: 4000,
  });

  serverMqttClient.on('connect', () => {
    console.log('[Server MQTT] Connected to Cloud Broker');
    serverMqttClient?.subscribe(SYNC_TOPIC, { qos: 1 });
  });

  serverMqttClient.on('message', (topic: string, message: Buffer) => {
    if (topic === SYNC_TOPIC) {
      try {
        const payload = JSON.parse(message.toString());
        if (payload && Array.isArray(payload.sessions) && payload.senderId !== 'server_backend') {
          const { merged, localUpdated } = reconcileServerSessions(serverState.sessions, payload.sessions);
          if (localUpdated) {
            serverState.sessions = merged;
            serverState.lastUpdated = Date.now();
            try {
              fs.writeFileSync(DATA_FILE, JSON.stringify(serverState, null, 2), 'utf-8');
            } catch {}
            notifySseClients();
          }
        }
      } catch {}
    }
  });

  serverMqttClient.on('error', (err) => {
    console.debug('[Server MQTT] Notice:', err.message);
  });
} catch (e) {
  console.debug('[Server MQTT] Init notice:', e);
}

function saveState(state: ServerState) {
  try {
    state.lastUpdated = Date.now();
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
    notifySseClients();

    // Broadcast retained state to cloud broker for all connected phones & managers
    if (serverMqttClient && serverMqttClient.connected) {
      try {
        serverMqttClient.publish(
          SYNC_TOPIC,
          JSON.stringify({
            type: 'SYNC_STATE',
            sessions: state.sessions,
            employees: state.employees,
            updatedAt: state.lastUpdated,
            lastResetTime: state.lastResetTime || 0,
            senderId: 'server_backend',
          }),
          { retain: true, qos: 1 }
        );
      } catch {}
    }
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
    lastResetTime: serverState.lastResetTime || 0,
    serverTime: Date.now(),
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

  app.use(express.json({ limit: '25mb' }));
  app.use(express.static('public'));

  const CUSTOM_AUDIO_FILE = path.join(DATA_DIR, 'custom_audios.json');

  function loadCustomAudios(): Record<string, string> {
    try {
      if (fs.existsSync(CUSTOM_AUDIO_FILE)) {
        return JSON.parse(fs.readFileSync(CUSTOM_AUDIO_FILE, 'utf-8'));
      }
    } catch (e) {
      console.error('Failed loading custom audios:', e);
    }
    return {
      audio2: '/audio/warning_5min.mp3',
      audio1: '/audio/warning_40min.mp3',
      audio3: '/audio/warning_overdue.mp3',
    };
  }

  function saveCustomAudios(data: Record<string, string>) {
    try {
      fs.writeFileSync(CUSTOM_AUDIO_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed saving custom audios:', e);
    }
  }

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

  // Get Complete State (Atomic multi-device snapshot with high-efficiency 10s polling)
  app.get('/api/state', (req: Request, res: Response) => {
    serverState.sessions = cleanStaleSessions(serverState.sessions);
    const serverTime = Date.now();

    // Strictly disable caching so client browsers & mobile webviews never get stale state
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({
      success: true,
      notModified: false,
      lastUpdated: serverState.lastUpdated,
      lastResetTime: serverState.lastResetTime || 0,
      serverTime,
      today: getTodayString(),
      sessions: serverState.sessions,
      employees: serverState.employees,
      customAudios: loadCustomAudios(),
      activeCount: serverState.sessions.filter((s) => s.endTime === null).length,
    });
  });

  // Get Custom Audios across all devices
  app.get('/api/custom-audio', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const audios = loadCustomAudios();
    res.json({ success: true, audios });
  });

  // Save / Update Custom Audio from any device and broadcast to all devices
  app.post('/api/custom-audio', (req: Request, res: Response) => {
    const { type, dataUrl } = req.body;
    if (!type || !['audio1', 'audio2', 'audio3'].includes(type) || !dataUrl) {
      return res.status(400).json({ success: false, message: 'Invalid audio payload' });
    }
    const audios = loadCustomAudios();
    audios[type] = dataUrl;
    audios.lastUpdated = String(Date.now());
    saveCustomAudios(audios);

    // Write binary file to public/audio so all devices can fetch it directly
    try {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const buffer = Buffer.from(match[2], 'base64');
        const filename =
          type === 'audio2'
            ? 'warning_5min.mp3'
            : type === 'audio1'
            ? 'warning_40min.mp3'
            : 'warning_overdue.mp3';
        const publicAudioDir = path.join(process.cwd(), 'public', 'audio');
        if (!fs.existsSync(publicAudioDir)) fs.mkdirSync(publicAudioDir, { recursive: true });
        fs.writeFileSync(path.join(publicAudioDir, filename), buffer);

        const distAudioDir = path.join(process.cwd(), 'dist', 'audio');
        if (fs.existsSync(distAudioDir)) {
          fs.writeFileSync(path.join(distAudioDir, filename), buffer);
        }
      }
    } catch (e) {
      console.error('Failed writing binary audio file:', e);
    }

    // Notify all SSE clients
    const payload = JSON.stringify({
      type: 'CUSTOM_AUDIO_UPDATED',
      audios,
      updatedType: type,
    });
    for (const client of sseClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch {}
    }

    res.json({ success: true, audios });
  });

  // Reset Custom Audio to default
  app.delete('/api/custom-audio/:type', (req: Request, res: Response) => {
    const { type } = req.params;
    const audios = loadCustomAudios();
    if (type === 'audio2') {
      audios.audio2 = '/audio/warning_5min.mp3';
    } else if (type === 'audio1') {
      audios.audio1 = '/audio/warning_40min.mp3';
    } else if (type === 'audio3') {
      audios.audio3 = '/audio/warning_overdue.mp3';
    }
    saveCustomAudios(audios);
    res.json({ success: true, audios });
  });

  // Get Employees
  app.get('/api/employees', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
    serverState.sessions = cleanStaleSessions(serverState.sessions);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const { today, nip } = req.query;
    let list = serverState.sessions;

    if (today === '1' || today === 'true') {
      const todayStr = getTodayString();
      list = list.filter((s) => s.date === todayStr || s.endTime === null);
    }
    if (typeof nip === 'string' && nip.trim()) {
      const cleanNip = nip.trim();
      list = list.filter(
        (s) => s.nip === cleanNip || parseInt(s.nip, 10) === parseInt(cleanNip, 10)
      );
    }

    res.json(list);
  });

  // Batch sync sessions across instances
  app.post('/api/sessions/sync-all', (req: Request, res: Response) => {
    const { sessions, lastResetTime } = req.body;
    if (Array.isArray(sessions)) {
      const { merged, localUpdated } = reconcileServerSessions(
        serverState.sessions,
        sessions,
        typeof lastResetTime === 'number' ? lastResetTime : 0
      );
      if (typeof lastResetTime === 'number' && lastResetTime > (serverState.lastResetTime || 0)) {
        serverState.lastResetTime = lastResetTime;
      }
      if (localUpdated) {
        serverState.sessions = merged;
        saveState(serverState);
      }
      return res.json({
        success: true,
        count: serverState.sessions.length,
        sessions: serverState.sessions,
        lastUpdated: serverState.lastUpdated,
        lastResetTime: serverState.lastResetTime || 0,
        serverTime: Date.now(),
      });
    }
    res.status(400).json({ success: false, message: 'Invalid sessions payload' });
  });

  // Start Break Session (Canonical ID supported, Master Clock Authority)
  app.post('/api/sessions/start', (req: Request, res: Response) => {
    const { nip, id, startTime, sessionNumber, employeeName, jobTitle, department } = req.body;
    if (!nip) {
      return res.status(400).json({ success: false, message: 'NIP wajib diisi.' });
    }

    const cleanNip = String(nip).trim();
    let employee = serverState.employees.find(
      (e) =>
        e.nip === cleanNip ||
        (!isNaN(parseInt(cleanNip, 10)) && parseInt(e.nip, 10) === parseInt(cleanNip, 10))
    );

    // Fallback: If employee not found in server list, auto-register to prevent staff lockout
    if (!employee && employeeName) {
      employee = {
        nip: cleanNip,
        name: String(employeeName).trim(),
        jobTitle: jobTitle || 'SMT',
        department: department || 'SMT',
        storeZone: 'Informa Alam Sutera',
        birthDate: '01/01/1990',
        password: 'password',
        role: 'staff',
      };
      serverState.employees.push(employee);
      saveState(serverState);
    }

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Karyawan tidak ditemukan.' });
    }

    // Clean any stale sessions first
    serverState.sessions = cleanStaleSessions(serverState.sessions);

    // If session with this ID already exists, return it cleanly
    if (id) {
      const existing = serverState.sessions.find((s) => s.id === id);
      if (existing) {
        return res.json({
          success: true,
          message: 'Sesi istirahat sudah tercatat.',
          session: existing,
          serverTime: Date.now(),
        });
      }
    }

    const today = getTodayString();
    const staffSessionsToday = serverState.sessions.filter(
      (s) =>
        (s.nip === employee.nip || parseInt(s.nip, 10) === parseInt(employee.nip, 10)) &&
        (s.date === today || s.endTime === null)
    );

    // Check if already currently on break
    const active = staffSessionsToday.find((s) => s.endTime === null);
    if (active) {
      return res.json({
        success: true,
        message: 'Anda sedang dalam sesi istirahat aktif.',
        session: active,
        serverTime: Date.now(),
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

    // Master clock authority: if client's time has reasonable skew (< 4000ms), respect it, else snap to server master clock
    const serverMasterNow = Date.now();
    const effectiveStartTime =
      typeof startTime === 'number' && Math.abs(serverMasterNow - startTime) < 4000
        ? startTime
        : serverMasterNow;

    const newSession: BreakSession = {
      id: newSessionId,
      nip: employee.nip,
      employeeName: employee.name,
      jobTitle: effectiveJobTitle,
      department: employee.department,
      storeZone: 'Informa Alam Sutera',
      date: today,
      startTime: effectiveStartTime,
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
      serverTime: Date.now(),
    });
  });

  // End Break Session (Master Clock Authority)
  app.post('/api/sessions/end', (req: Request, res: Response) => {
    const { nip, sessionId, endTime } = req.body;
    const cleanNip = nip ? String(nip).trim() : '';

    const idx = serverState.sessions.findIndex((s) => {
      if (sessionId && s.id === sessionId) return true;
      if (cleanNip) {
        const matchesNip =
          s.nip === cleanNip ||
          (!isNaN(parseInt(cleanNip, 10)) && parseInt(s.nip, 10) === parseInt(cleanNip, 10));
        return matchesNip && s.endTime === null;
      }
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
        serverTime: Date.now(),
      });
    }

    const serverMasterNow = Date.now();
    const finishTime =
      typeof endTime === 'number' && Math.abs(serverMasterNow - endTime) < 4000
        ? endTime
        : serverMasterNow;

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
      serverTime: Date.now(),
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
    serverState.lastResetTime = Date.now();
    saveState(serverState);
    res.json({
      success: true,
      message: 'Data istirahat hari ini berhasil direset.',
      lastResetTime: serverState.lastResetTime,
    });
  });

  // Clear All Sessions completely
  app.post('/api/sessions/clear-all', (req: Request, res: Response) => {
    serverState.sessions = [];
    serverState.lastResetTime = Date.now();
    saveState(serverState);
    res.json({
      success: true,
      message: 'Seluruh riwayat sesi berhasil dikosongkan.',
      lastResetTime: serverState.lastResetTime,
    });
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
