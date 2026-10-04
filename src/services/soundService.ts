// Sound and Audio service for Informa Alam Sutera Break Management
// Supports both natural Indonesian Female Speech synthesis and custom uploaded/recorded voice notes
import { DEFAULT_AUDIO_5MIN, DEFAULT_AUDIO_40MIN, DEFAULT_AUDIO_OVERDUE, AUDIO_FILE_PATHS } from './defaultAudios';

const STORAGE_KEYS = {
  AUDIO_1: 'informa_voice_audio1',
  AUDIO_2: 'informa_voice_audio2',
  AUDIO_3: 'informa_voice_audio3',
  SELECTED_VOICE_URI: 'informa_voice_uri',
  SPEECH_PITCH: 'informa_speech_pitch',
  SPEECH_RATE: 'informa_speech_rate',
  VOICE_LOCKED: 'informa_voice_locked_v1',
};

let audioContext: AudioContext | null = null;
let silentAudioUnlocked = false;

/**
 * In-memory custom audio cache synced from server
 */
const memoryAudioCache: Record<string, string> = {
  audio2: AUDIO_FILE_PATHS.audio2,
  audio1: AUDIO_FILE_PATHS.audio1,
  audio3: AUDIO_FILE_PATHS.audio3,
};

/**
 * Apply server-authoritative custom audios to memory and local storage
 */
export function applyServerCustomAudios(audios: Record<string, string>) {
  if (!audios) return;
  if (audios.audio2) memoryAudioCache.audio2 = audios.audio2;
  if (audios.audio1) memoryAudioCache.audio1 = audios.audio1;
  if (audios.audio3) memoryAudioCache.audio3 = audios.audio3;
}

/**
 * Synchronize custom audios from central server across all 250 phones and manager monitors
 */
export async function syncServerCustomAudios(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch(`/api/custom-audio?t=${Date.now()}`, { cache: 'no-store' }).then((r) =>
      r.ok ? r.json() : null
    );
    if (res && res.success && res.audios) {
      applyServerCustomAudios(res.audios);
    }
  } catch (e) {
    console.debug('Failed to sync server custom audios, using local fallback:', e);
  }
}

if (typeof window !== 'undefined') {
  syncServerCustomAudios();
}

/**
 * Unlocks the Web Audio context and SpeechSynthesis engine after user interaction (click/touch).
 */
export function unlockAudio(): boolean {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioContext && AudioCtx) {
      audioContext = new AudioCtx();
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Pre-unlock HTML5 Audio on mobile Safari & Chrome with a 1-sample silent WAV
    if (!silentAudioUnlocked && typeof window !== 'undefined') {
      const silentAudio = new Audio();
      silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      silentAudio.play().then(() => {
        silentAudioUnlocked = true;
      }).catch(() => {});
    }

    // Prime speech synthesis on mobile browsers
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}
    }
    return true;
  } catch (e) {
    console.warn('Audio unlock error:', e);
    return false;
  }
}

// Global user gesture listener for seamless mobile audio unlock
if (typeof window !== 'undefined') {
  const globalUnlock = () => {
    unlockAudio();
  };
  window.addEventListener('click', globalUnlock, { passive: true });
  window.addEventListener('touchstart', globalUnlock, { passive: true });
  window.addEventListener('touchend', globalUnlock, { passive: true });
}

/**
 * Synthesizes a realistic station tubular bell strike with natural overtones and concourse echo.
 */
function playTubularBellNote(
  ctx: AudioContext,
  dest: AudioNode,
  delayBus: AudioNode,
  freq: number,
  startTime: number,
  gainLevel: number = 0.35
) {
  // Fundamental tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, startTime);

  gain1.gain.setValueAtTime(0.001, startTime);
  gain1.gain.exponentialRampToValueAtTime(gainLevel, startTime + 0.015);
  gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.4);

  osc1.connect(gain1);
  gain1.connect(dest);
  gain1.connect(delayBus);
  osc1.start(startTime);
  osc1.stop(startTime + 1.45);

  // Overtone 1: ~2.76x (characteristic chime / brass resonance)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2.76, startTime);

  gain2.gain.setValueAtTime(0.001, startTime);
  gain2.gain.exponentialRampToValueAtTime(gainLevel * 0.35, startTime + 0.01);
  gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.8);

  osc2.connect(gain2);
  gain2.connect(dest);
  gain2.connect(delayBus);
  osc2.start(startTime);
  osc2.stop(startTime + 0.85);

  // Overtone 2: ~5.40x (bright metallic chime strike)
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 5.4, startTime);

  gain3.gain.setValueAtTime(0.001, startTime);
  gain3.gain.exponentialRampToValueAtTime(gainLevel * 0.15, startTime + 0.008);
  gain3.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);

  osc3.connect(gain3);
  gain3.connect(dest);
  gain3.connect(delayBus);
  osc3.start(startTime);
  osc3.stop(startTime + 0.45);
}

/**
 * Plays the iconic 4-tone Station Chime (Nada Masuk Stasiun KAI: Do - Mi - Sol - Do').
 */
export function playStationChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      unlockAudio();
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioContext && AudioCtx) {
        audioContext = new AudioCtx();
      }
      if (!audioContext) {
        resolve();
        return;
      }

      const now = audioContext.currentTime;

      const masterGain = audioContext.createGain();
      masterGain.gain.setValueAtTime(0.9, now);
      masterGain.connect(audioContext.destination);

      const delayNode = audioContext.createDelay();
      delayNode.delayTime.setValueAtTime(0.22, now);

      const delayFeedback = audioContext.createGain();
      delayFeedback.gain.setValueAtTime(0.28, now);

      const delayFilter = audioContext.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.setValueAtTime(2200, now);

      delayNode.connect(delayFilter);
      delayFilter.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayFilter.connect(masterGain);

      // 4-tone sequence: C4, E4, G4, C5
      playTubularBellNote(audioContext, masterGain, delayNode, 261.63, now + 0.0, 0.35);
      playTubularBellNote(audioContext, masterGain, delayNode, 329.63, now + 0.45, 0.35);
      playTubularBellNote(audioContext, masterGain, delayNode, 392.0, now + 0.9, 0.38);
      playTubularBellNote(audioContext, masterGain, delayNode, 523.25, now + 1.35, 0.42);

      setTimeout(() => {
        resolve();
      }, 2300);
    } catch {
      resolve();
    }
  });
}

/**
 * Plays urgent alert chime for overdue break (> 40 minutes).
 */
export function playUrgentOverdueChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      unlockAudio();
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioContext && AudioCtx) {
        audioContext = new AudioCtx();
      }
      if (!audioContext) {
        resolve();
        return;
      }

      const now = audioContext.currentTime;
      const masterGain = audioContext.createGain();
      masterGain.gain.setValueAtTime(1.0, now);
      masterGain.connect(audioContext.destination);

      const delayNode = audioContext.createDelay();
      delayNode.delayTime.setValueAtTime(0.18, now);
      const delayFeedback = audioContext.createGain();
      delayFeedback.gain.setValueAtTime(0.3, now);
      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayFeedback.connect(masterGain);

      playTubularBellNote(audioContext, masterGain, delayNode, 587.33, now + 0.0, 0.45);
      playTubularBellNote(audioContext, masterGain, delayNode, 783.99, now + 0.35, 0.5);
      playTubularBellNote(audioContext, masterGain, delayNode, 587.33, now + 0.75, 0.45);
      playTubularBellNote(audioContext, masterGain, delayNode, 783.99, now + 1.1, 0.52);

      setTimeout(() => {
        resolve();
      }, 1900);
    } catch {
      resolve();
    }
  });
}

/**
 * 2-tone Station Outro Chime (Sol - Do)
 */
export function playStationOutroChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      unlockAudio();
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioContext && AudioCtx) {
        audioContext = new AudioCtx();
      }
      if (!audioContext) {
        resolve();
        return;
      }
      const now = audioContext.currentTime;
      const masterGain = audioContext.createGain();
      masterGain.gain.setValueAtTime(0.7, now);
      masterGain.connect(audioContext.destination);

      playTubularBellNote(audioContext, masterGain, masterGain, 392.0, now + 0.05, 0.28);
      playTubularBellNote(audioContext, masterGain, masterGain, 261.63, now + 0.45, 0.3);

      setTimeout(() => {
        resolve();
      }, 1100);
    } catch {
      resolve();
    }
  });
}

export const playStoreChime = playStationChime;

// ---------------- Custom Audio Storage & Playback ---------------- //

export function isVoiceLocked(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.VOICE_LOCKED);
    if (val === null) {
      // Default to locked if any voice file exists to safeguard user's uploaded voice files!
      return Boolean(
        localStorage.getItem(STORAGE_KEYS.AUDIO_1) ||
        localStorage.getItem(STORAGE_KEYS.AUDIO_2) ||
        localStorage.getItem(STORAGE_KEYS.AUDIO_3)
      );
    }
    return val === 'true';
  } catch {
    return true;
  }
}

export function setVoiceLocked(locked: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.VOICE_LOCKED, locked ? 'true' : 'false');
  } catch (e) {
    console.error('Failed to update voice lock status:', e);
  }
}

export function getCustomAudio(type: 'audio1' | 'audio2' | 'audio3'): string | null {
  try {
    const key =
      type === 'audio1'
        ? STORAGE_KEYS.AUDIO_1
        : type === 'audio2'
        ? STORAGE_KEYS.AUDIO_2
        : STORAGE_KEYS.AUDIO_3;
    const local = localStorage.getItem(key);
    if (local) return local;
  } catch {}

  if (memoryAudioCache[type]) {
    return memoryAudioCache[type];
  }

  if (type === 'audio2') return AUDIO_FILE_PATHS.audio2;
  if (type === 'audio1') return AUDIO_FILE_PATHS.audio1;
  if (type === 'audio3') return AUDIO_FILE_PATHS.audio3;

  return null;
}

export function saveCustomAudio(type: 'audio1' | 'audio2' | 'audio3', dataUrl: string): void {
  try {
    const key =
      type === 'audio1'
        ? STORAGE_KEYS.AUDIO_1
        : type === 'audio2'
        ? STORAGE_KEYS.AUDIO_2
        : STORAGE_KEYS.AUDIO_3;
    localStorage.setItem(key, dataUrl);
    // Lock automatically whenever an audio is uploaded/saved
    localStorage.setItem(STORAGE_KEYS.VOICE_LOCKED, 'true');
  } catch (e) {
    console.warn('LocalStorage save warning:', e);
  }

  memoryAudioCache[type] = dataUrl;

  // Sync to central server so all other devices receive this audio immediately
  fetch('/api/custom-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, dataUrl }),
  }).catch((err) => console.error('Failed to sync custom audio to server:', err));
}

export function removeCustomAudio(type: 'audio1' | 'audio2' | 'audio3'): void {
  if (isVoiceLocked()) {
    throw new Error('File suara sedang dikunci untuk melindungi rekaman yang sudah diunggah. Buka kunci terlebih dahulu.');
  }
  try {
    const key =
      type === 'audio1'
        ? STORAGE_KEYS.AUDIO_1
        : type === 'audio2'
        ? STORAGE_KEYS.AUDIO_2
        : STORAGE_KEYS.AUDIO_3;
    localStorage.removeItem(key);
  } catch (e) {
    console.error(e);
  }

  if (type === 'audio2') memoryAudioCache.audio2 = AUDIO_FILE_PATHS.audio2;
  if (type === 'audio1') memoryAudioCache.audio1 = AUDIO_FILE_PATHS.audio1;
  if (type === 'audio3') memoryAudioCache.audio3 = AUDIO_FILE_PATHS.audio3;

  fetch(`/api/custom-audio/${type}`, { method: 'DELETE' }).catch(() => {});
}

let activePlayingAudio: HTMLAudioElement | null = null;

/**
 * Plays an audio data URL or media URL with robust fallback to speech synthesis so all devices are guaranteed to hear it.
 */
export function playAudioElement(audioSrc: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (isCurrentItemCancelled) {
        resolve();
        return;
      }
      unlockAudio();
      const audio = new Audio(audioSrc);
      activePlayingAudio = audio;
      audio.preload = 'auto';

      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          if (activePlayingAudio === audio) {
            activePlayingAudio = null;
          }
          resolve();
        }
      };

      // Failsafe timeout in case audio file is stuck or blocked
      const safetyTimeout = setTimeout(done, 12000);

      audio.onended = () => {
        clearTimeout(safetyTimeout);
        done();
      };

      let fallbackTriggered = false;
      const handleFallback = async (reason: unknown) => {
        if (fallbackTriggered || resolved) return;
        fallbackTriggered = true;
        clearTimeout(safetyTimeout);
        if (isCurrentItemCancelled) {
          done();
          return;
        }
        console.warn('Audio playback fallback triggered:', reason);
        try {
          if (!isCurrentItemCancelled) {
            if (audioSrc.includes('warning_5min') || audioSrc.includes('audio2')) {
              await speakIndonesian('Hai guys, waktunya 5 menit lagi, siap-siap ya!', 0.96, 1.0);
            } else if (audioSrc.includes('warning_40min') || audioSrc.includes('audio1')) {
              await speakIndonesian('Waktu istirahat lu tuh udah habis. Ayo cepat masuk, jualan lagi!', 0.94, 1.0);
            } else if (audioSrc.includes('warning_overdue') || audioSrc.includes('audio3')) {
              await speakIndonesian('Waktu lu tuh udah habis! Masuk ke floor sekarang juga!', 0.96, 1.0);
            }
          }
        } catch {}
        done();
      };

      audio.onerror = (e) => handleFallback(e);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => handleFallback(err));
      }
    } catch (err) {
      if (activePlayingAudio) {
        activePlayingAudio = null;
      }
      resolve();
    }
  });
}

// ---------------- Voice Detection & Indonesian Female Prioritization ---------------- //

let cachedVoices: SpeechSynthesisVoice[] = [];

export function getSystemVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve([]);
      return;
    }
    const current = window.speechSynthesis.getVoices();
    if (current.length > 0) {
      cachedVoices = current;
      resolve(current);
      return;
    }

    const timer = setTimeout(() => {
      resolve(window.speechSynthesis.getVoices());
    }, 1200);

    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timer);
      const updated = window.speechSynthesis.getVoices();
      cachedVoices = updated;
      resolve(updated);
    };
  });
}

export function getSelectedVoiceURI(): string {
  return localStorage.getItem(STORAGE_KEYS.SELECTED_VOICE_URI) || '';
}

export function setSelectedVoiceURI(uri: string): void {
  localStorage.setItem(STORAGE_KEYS.SELECTED_VOICE_URI, uri);
}

export function getSpeechPitch(): number {
  const p = localStorage.getItem(STORAGE_KEYS.SPEECH_PITCH);
  // Default pitch 1.0 for clean, natural human vocal resonance without digital distortion
  return p ? parseFloat(p) : 1.0;
}

export function setSpeechPitch(pitch: number): void {
  localStorage.setItem(STORAGE_KEYS.SPEECH_PITCH, String(pitch));
}

export function getSpeechRate(): number {
  const r = localStorage.getItem(STORAGE_KEYS.SPEECH_RATE);
  // Default rate 0.92 for crisp, distinct articulation of every syllable
  return r ? parseFloat(r) : 0.92;
}

export function setSpeechRate(rate: number): void {
  localStorage.setItem(STORAGE_KEYS.SPEECH_RATE, String(rate));
}

/**
 * Finds the best Indonesian female voice available on the device.
 */
export async function getBestIndonesianFemaleVoice(): Promise<SpeechSynthesisVoice | null> {
  const voices = await getSystemVoices();
  if (voices.length === 0) return null;

  const savedUri = getSelectedVoiceURI();
  if (savedUri) {
    const foundSaved = voices.find((v) => v.voiceURI === savedUri);
    if (foundSaved) return foundSaved;
  }

  // 1. Natural female Indonesian voices (Google Bahasa Indonesia, Microsoft Gadis, Siti, Damayanti, etc.)
  const indoFemale = voices.find((v) => {
    const lang = v.lang.toLowerCase().replace('_', '-');
    const isId = lang.startsWith('id') || lang.startsWith('in');
    const name = v.name.toLowerCase();
    const isFemale =
      name.includes('gadis') ||
      name.includes('damayanti') ||
      name.includes('siti') ||
      name.includes('female') ||
      name.includes('wanita') ||
      (name.includes('google') && isId);
    return isId && isFemale;
  });
  if (indoFemale) return indoFemale;

  // 2. Any Indonesian voice
  const anyIndo = voices.find((v) => {
    const lang = v.lang.toLowerCase().replace('_', '-');
    return lang.startsWith('id') || lang.startsWith('in');
  });
  if (anyIndo) return anyIndo;

  // 3. Fallback to any natural female voice
  const anyFemale = voices.find((v) => {
    const name = v.name.toLowerCase();
    return (
      (name.includes('female') || name.includes('natural') || name.includes('samantha') || name.includes('zira')) &&
      !name.includes('male')
    );
  });
  if (anyFemale) return anyFemale;

  return voices[0] || null;
}

/**
 * Clean and format employee name into Title Case and expand abbreviations
 * so TTS reads it naturally as fluent human words rather than spelling letters out!
 */
export function formatNameForSpeech(rawName: string): string {
  if (!rawName) return '';
  // 1. Remove trailing dots, underscores, dashes
  let cleaned = rawName
    .replace(/[._\-–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Expand common Indonesian name initials so they are not spelled letter by letter
  cleaned = cleaned
    .replace(/\bM\b\.?/gi, 'Muhammad')
    .replace(/\bMoh\b\.?/gi, 'Mohammad')
    .replace(/\bMoch\b\.?/gi, 'Mochamad')
    .replace(/\bMuh\b\.?/gi, 'Muhammad')
    .replace(/\bA\b\.?/gi, 'Ahmad')
    .replace(/\bBr\b\.?/gi, 'Boru');

  // 3. Convert ALL-CAPS into proper Title Case (e.g. "PRIMA MAELANA" -> "Prima Maelana")
  // In Web Speech API, uppercase words are treated as acronyms and spelled out.
  // Converting to Title Case forces the engine to pronounce words normally!
  cleaned = cleaned
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return cleaned;
}

/**
 * Small delay helper
 */
export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Speaks text using Web Speech API with selected Indonesian female voice settings.
 */
export async function speakIndonesian(
  text: string,
  rateMultiplier: number = 1.0,
  pitchMultiplier: number = 1.0
): Promise<void> {
  if (!('speechSynthesis' in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const voice = await getBestIndonesianFemaleVoice();

  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(safetyTimeout);
        resolve();
      }
    };

    // Failsafe timeout in case browser TTS engine hangs
    const safetyTimeout = setTimeout(() => {
      safeResolve();
    }, 12000);

    const utterance = new SpeechSynthesisUtterance(text);
    // Explicitly set language tag
    utterance.lang = voice?.lang && (voice.lang.startsWith('id') || voice.lang.startsWith('in')) ? voice.lang : 'id-ID';

    const basePitch = getSpeechPitch();
    const baseRate = getSpeechRate();
    // Keep pitch clamped to natural human voice range [0.8, 1.4] to avoid screechy robotic artifacts
    utterance.pitch = Math.min(1.4, Math.max(0.75, basePitch * pitchMultiplier));
    utterance.rate = Math.min(1.3, Math.max(0.75, baseRate * rateMultiplier));
    utterance.volume = 1.0;

    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => safeResolve();
    utterance.onerror = (e) => {
      console.warn('TTS utterance error:', e);
      safeResolve();
    };

    window.speechSynthesis.speak(utterance);
  });
}

export const speakIndonesianAnnouncement = speakIndonesian;

/**
 * Formats the team call label (prioritizing SMT team).
 * Pronounces SMT as "Es Em Te" so it is articulated with crystal clarity.
 */
export function formatTeamCall(
  staffName: string,
  jobTitle?: string,
  department?: string
): { cleanName: string; teamLabel: string; spokenTeam: string } {
  const cleanName = formatNameForSpeech(staffName);
  const isSMT =
    (jobTitle && (jobTitle.toUpperCase() === 'SMT' || jobTitle.toUpperCase().includes('SMT') || jobTitle.toUpperCase().includes('SALES'))) ||
    (department && (department.toUpperCase() === 'SMT' || department.toUpperCase().includes('SALES')));

  if (isSMT) {
    return {
      cleanName,
      teamLabel: 'tim SMT',
      spokenTeam: 'tim Es Em Te',
    };
  }

  if (department && department !== 'Back Office Retail' && department !== 'STORE') {
    const deptUpper = department.toUpperCase();
    if (deptUpper.includes('PRODUCT') || deptUpper.includes('PRODUK')) {
      return { cleanName, teamLabel: 'tim Product', spokenTeam: 'tim Produk' };
    }
    if (deptUpper.includes('CASHIER') || deptUpper.includes('KASIR')) {
      return { cleanName, teamLabel: 'tim Kasir', spokenTeam: 'tim Kasir' };
    }
    if (deptUpper.includes('LOGISTIC') || deptUpper.includes('LOGISTIK')) {
      return { cleanName, teamLabel: 'tim Logistik', spokenTeam: 'tim Logistik' };
    }
    if (deptUpper.includes('DESIGNER')) {
      return { cleanName, teamLabel: 'tim Designer', spokenTeam: 'tim Desainer' };
    }
    return {
      cleanName,
      teamLabel: `tim ${department}`,
      spokenTeam: `tim ${formatNameForSpeech(department)}`,
    };
  }

  return {
    cleanName,
    teamLabel: '',
    spokenTeam: '',
  };
}

// ---------------- Sequential Audio Announcement Queue ---------------- //

export interface AudioQueueStatus {
  isProcessing: boolean;
  queueLength: number;
  currentTitle: string | null;
}

interface QueuedItem {
  id: string;
  dedupeKey: string;
  label: string;
  nip?: string;
  sessionId?: string;
  employeeName?: string;
  execute: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
  timestamp: number;
}

const audioQueue: QueuedItem[] = [];
let isQueueProcessing = false;
let currentActiveAnnouncement: string | null = null;
let currentActiveItem: QueuedItem | null = null;
let isCurrentItemCancelled = false;
const recentlyCompleted = new Map<string, number>();

// Active session status checker callback (registered by storage service)
type ActiveSessionChecker = (nip?: string, sessionId?: string, name?: string) => boolean;
let activeSessionChecker: ActiveSessionChecker | null = null;

export function registerActiveSessionChecker(checker: ActiveSessionChecker) {
  activeSessionChecker = checker;
}

/**
 * Instantly cancels any pending announcements for an employee who has checked out,
 * and halts any speech or sound currently in progress.
 */
export function cancelAnnouncementsForStaff(nip?: string, staffName?: string, sessionId?: string): void {
  const cleanNip = nip ? String(nip).trim() : '';
  const cleanName = staffName ? staffName.toLowerCase().trim() : '';

  // 1. Remove all matching items from the queue
  for (let i = audioQueue.length - 1; i >= 0; i--) {
    const item = audioQueue[i];
    const matchId = sessionId && item.sessionId === sessionId;
    const matchNip =
      cleanNip &&
      item.nip &&
      (item.nip === cleanNip ||
        (!isNaN(parseInt(cleanNip, 10)) && parseInt(item.nip, 10) === parseInt(cleanNip, 10)));
    const matchName = cleanName && item.employeeName && item.employeeName.toLowerCase().includes(cleanName);

    if (matchId || matchNip || matchName) {
      console.log(`[AudioQueue] Cancelled pending announcement for "${item.label}" because staff checked out.`);
      item.resolve();
      audioQueue.splice(i, 1);
    }
  }

  // 2. If the current actively playing announcement belongs to this staff member, halt it immediately!
  if (currentActiveItem) {
    const matchId = sessionId && currentActiveItem.sessionId === sessionId;
    const matchNip =
      cleanNip &&
      currentActiveItem.nip &&
      (currentActiveItem.nip === cleanNip ||
        (!isNaN(parseInt(cleanNip, 10)) && parseInt(currentActiveItem.nip, 10) === parseInt(cleanNip, 10)));
    const matchName =
      cleanName &&
      currentActiveItem.employeeName &&
      currentActiveItem.employeeName.toLowerCase().includes(cleanName);

    if (matchId || matchNip || matchName) {
      console.log(`[AudioQueue] Aborting actively playing announcement for "${currentActiveItem.label}".`);
      isCurrentItemCancelled = true;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (activePlayingAudio) {
        try {
          activePlayingAudio.pause();
          activePlayingAudio.currentTime = 0;
        } catch {}
        activePlayingAudio = null;
      }
    }
  }

  emitQueueStatus();
}

type QueueSubscriber = (status: AudioQueueStatus) => void;
const queueSubscribers = new Set<QueueSubscriber>();

function emitQueueStatus() {
  const status: AudioQueueStatus = {
    isProcessing: isQueueProcessing,
    queueLength: audioQueue.length,
    currentTitle: currentActiveAnnouncement,
  };
  queueSubscribers.forEach((sub) => {
    try {
      sub(status);
    } catch {}
  });
}

export function subscribeAudioQueue(subscriber: QueueSubscriber): () => void {
  queueSubscribers.add(subscriber);
  subscriber({
    isProcessing: isQueueProcessing,
    queueLength: audioQueue.length,
    currentTitle: currentActiveAnnouncement,
  });
  return () => {
    queueSubscribers.delete(subscriber);
  };
}

export function getAudioQueueStatus(): AudioQueueStatus {
  return {
    isProcessing: isQueueProcessing,
    queueLength: audioQueue.length,
    currentTitle: currentActiveAnnouncement,
  };
}

/**
 * Enqueues an announcement task to run sequentially without overlapping.
 * If another announcement is currently playing, this announcement will wait
 * until the previous one finishes (plus a polite 1000ms breathing gap) before playing.
 */
export function enqueueAnnouncement(
  dedupeKey: string,
  label: string,
  task: () => Promise<void>,
  meta?: { nip?: string; sessionId?: string; employeeName?: string }
): Promise<void> {
  const now = Date.now();

  // Deduplicate if identical call was completed in the last 5 minutes (300,000ms)
  // Each alert (sisa 5m, tepat 40m, overdue) should ONLY be called ONCE per break session!
  const lastFinished = recentlyCompleted.get(dedupeKey);
  if (lastFinished && now - lastFinished < 300000) {
    return Promise.resolve();
  }

  // Deduplicate if identical item is already in queue or playing
  const alreadyQueued = audioQueue.some((q) => q.dedupeKey === dedupeKey);
  if (alreadyQueued || (currentActiveItem && currentActiveItem.dedupeKey === dedupeKey)) {
    return Promise.resolve();
  }

  // If staff has ALREADY checked out, do not enqueue!
  if (activeSessionChecker) {
    const isStillActive = activeSessionChecker(meta?.nip, meta?.sessionId, meta?.employeeName || label);
    if (!isStillActive) {
      console.log(`[AudioQueue] Staff "${label}" is not actively on break. Skipping enqueue.`);
      return Promise.resolve();
    }
  }

  return new Promise<void>((resolve, reject) => {
    const item: QueuedItem = {
      id: 'q_' + Math.random().toString(36).substring(2, 9),
      dedupeKey,
      label,
      nip: meta?.nip,
      sessionId: meta?.sessionId,
      employeeName: meta?.employeeName,
      execute: task,
      resolve,
      reject,
      timestamp: now,
    };

    audioQueue.push(item);
    emitQueueStatus();
    processAudioQueue();
  });
}

async function processAudioQueue() {
  if (isQueueProcessing) {
    return;
  }
  if (audioQueue.length === 0) {
    isQueueProcessing = false;
    currentActiveAnnouncement = null;
    currentActiveItem = null;
    emitQueueStatus();
    return;
  }

  isQueueProcessing = true;
  const currentItem = audioQueue.shift()!;
  currentActiveItem = currentItem;
  isCurrentItemCancelled = false;
  currentActiveAnnouncement = currentItem.label;
  emitQueueStatus();

  // CRITICAL CHECK: Before speaking a single sound, verify if the staff member has already checked out!
  if (activeSessionChecker) {
    const isStillActive = activeSessionChecker(
      currentItem.nip,
      currentItem.sessionId,
      currentItem.employeeName
    );
    if (!isStillActive) {
      console.log(`[AudioQueue] Staff "${currentItem.label}" has already checked out! Dropping announcement.`);
      currentItem.resolve();
      currentActiveItem = null;
      isQueueProcessing = false;
      currentActiveAnnouncement = null;
      emitQueueStatus();
      processAudioQueue();
      return;
    }
  }

  try {
    unlockAudio();
    await currentItem.execute();
    currentItem.resolve();
  } catch (err) {
    console.error(`[AudioQueue] Error executing: ${currentItem.label}`, err);
    currentItem.resolve();
  } finally {
    recentlyCompleted.set(currentItem.dedupeKey, Date.now());

    // Clean old entries (> 10 minutes)
    for (const [k, time] of recentlyCompleted.entries()) {
      if (Date.now() - time > 600000) {
        recentlyCompleted.delete(k);
      }
    }

    // Natural station pause between sequential announcements (1000ms)
    // Guarantees calls never collide or cut each other off
    await waitMs(1000);

    isQueueProcessing = false;
    currentActiveAnnouncement = null;
    currentActiveItem = null;
    isCurrentItemCancelled = false;
    emitQueueStatus();

    // Process next item in queue
    processAudioQueue();
  }
}

// ---------------- Announcement Playback Implementations ---------------- //

async function executeAudio1(staffName: string, nip?: string, sessionId?: string): Promise<void> {
  const isCancelled = () => {
    if (isCurrentItemCancelled) return true;
    if (activeSessionChecker && !activeSessionChecker(nip, sessionId, staffName)) {
      return true;
    }
    return false;
  };

  if (isCancelled()) return;
  await playStationChime();
  if (isCancelled()) return;

  const cleanName = formatNameForSpeech(staffName);
  const introPhrase = `${cleanName}, ada pesan buat kamu.`;

  await speakIndonesian(introPhrase, 0.94, 1.0);
  if (isCancelled()) return;
  await waitMs(300);
  if (isCancelled()) return;

  const audioSrc = getCustomAudio('audio1') || AUDIO_FILE_PATHS.audio1;
  await playAudioElement(audioSrc);
  if (isCancelled()) return;

  await waitMs(300);
  if (isCancelled()) return;
  await playStationOutroChime();
}

/**
 * AUDIO 1: Saat sudah 40 menit
 * Enqueued sequentially so multiple employees never overlap.
 */
export function playAudio1Sudah40Menit(
  staffName: string,
  nipOrJobTitle?: string,
  sessionIdOrDept?: string,
  jobTitle?: string,
  department?: string
): Promise<void> {
  let nip = nipOrJobTitle;
  let sessionId = sessionIdOrDept;
  let effectiveJob = jobTitle;
  let effectiveDept = department;

  if (nipOrJobTitle && isNaN(Number(nipOrJobTitle)) && !sessionIdOrDept?.startsWith('brk_')) {
    effectiveJob = nipOrJobTitle;
    effectiveDept = sessionIdOrDept;
    nip = undefined;
    sessionId = undefined;
  }
  if (sessionId && !sessionId.startsWith('brk_')) {
    if (!effectiveDept) effectiveDept = sessionId;
    sessionId = undefined;
  }

  const cleanName = formatNameForSpeech(staffName);
  const dedupeKey = sessionId ? `audio1_sess_${sessionId}` : `audio1_${(nip || cleanName).toLowerCase()}`;
  const label = `${cleanName} (Waktu 40 Menit Habis)`;
  return enqueueAnnouncement(
    dedupeKey,
    label,
    () => executeAudio1(staffName, nip, sessionId),
    { nip, sessionId, employeeName: staffName }
  );
}

async function executeAudio2(staffName: string, nip?: string, sessionId?: string): Promise<void> {
  const isCancelled = () => {
    if (isCurrentItemCancelled) return true;
    if (activeSessionChecker && !activeSessionChecker(nip, sessionId, staffName)) {
      return true;
    }
    return false;
  };

  if (isCancelled()) return;
  await playStationChime();
  if (isCancelled()) return;

  const cleanName = formatNameForSpeech(staffName);
  const introPhrase = `${cleanName}, ada pesan buat kamu.`;

  await speakIndonesian(introPhrase, 0.94, 1.0);
  if (isCancelled()) return;
  await waitMs(300);
  if (isCancelled()) return;

  // Exact user-requested audio: "Hai guys, waktunya 5 menit lagi, siap-siap ya!"
  const audioSrc = getCustomAudio('audio2') || AUDIO_FILE_PATHS.audio2;
  await playAudioElement(audioSrc);
  if (isCancelled()) return;

  await waitMs(300);
  if (isCancelled()) return;
  await playStationOutroChime();
}

/**
 * AUDIO 2: Saat 5 menit lagi habis (menit ke-35)
 * Enqueued sequentially so multiple employees never overlap.
 */
export function playAudio2Sisa5Menit(
  staffName: string,
  nipOrJobTitle?: string,
  sessionIdOrDept?: string,
  jobTitle?: string,
  department?: string
): Promise<void> {
  let nip = nipOrJobTitle;
  let sessionId = sessionIdOrDept;
  let effectiveJob = jobTitle;
  let effectiveDept = department;

  if (nipOrJobTitle && isNaN(Number(nipOrJobTitle)) && !sessionIdOrDept?.startsWith('brk_')) {
    effectiveJob = nipOrJobTitle;
    effectiveDept = sessionIdOrDept;
    nip = undefined;
    sessionId = undefined;
  }
  if (sessionId && !sessionId.startsWith('brk_')) {
    if (!effectiveDept) effectiveDept = sessionId;
    sessionId = undefined;
  }

  const cleanName = formatNameForSpeech(staffName);
  const dedupeKey = sessionId ? `audio2_sess_${sessionId}` : `audio2_${(nip || cleanName).toLowerCase()}`;
  const label = `${cleanName} (Peringatan 5 Menit: Hai guys...)`;
  return enqueueAnnouncement(
    dedupeKey,
    label,
    () => executeAudio2(staffName, nip, sessionId),
    { nip, sessionId, employeeName: staffName }
  );
}

async function executeAudio3(staffName: string, nip?: string, sessionId?: string): Promise<void> {
  const isCancelled = () => {
    if (isCurrentItemCancelled) return true;
    if (activeSessionChecker && !activeSessionChecker(nip, sessionId, staffName)) {
      return true;
    }
    return false;
  };

  if (isCancelled()) return;
  await playUrgentOverdueChime();
  if (isCancelled()) return;

  const cleanName = formatNameForSpeech(staffName);
  const introPhrase = `${cleanName}, ada pesan buat kamu.`;

  await speakIndonesian(introPhrase, 0.94, 1.0);
  if (isCancelled()) return;
  await waitMs(300);
  if (isCancelled()) return;

  const audioSrc = getCustomAudio('audio3') || AUDIO_FILE_PATHS.audio3;
  await playAudioElement(audioSrc);
  if (isCancelled()) return;

  await waitMs(300);
  if (isCancelled()) return;
  await playStationOutroChime();
}

/**
 * AUDIO 3: Saat sudah lewat 40 menit (> 40 menit / Overdue)
 * Enqueued sequentially so multiple employees never overlap.
 */
export function playAudio3UdahLewat40Menit(
  staffName: string,
  nipOrJobTitle?: string,
  sessionIdOrDept?: string,
  jobTitle?: string,
  department?: string
): Promise<void> {
  let nip = nipOrJobTitle;
  let sessionId = sessionIdOrDept;
  let effectiveJob = jobTitle;
  let effectiveDept = department;

  if (nipOrJobTitle && isNaN(Number(nipOrJobTitle)) && !sessionIdOrDept?.startsWith('brk_')) {
    effectiveJob = nipOrJobTitle;
    effectiveDept = sessionIdOrDept;
    nip = undefined;
    sessionId = undefined;
  }
  if (sessionId && !sessionId.startsWith('brk_')) {
    if (!effectiveDept) effectiveDept = sessionId;
    sessionId = undefined;
  }

  const cleanName = formatNameForSpeech(staffName);
  const dedupeKey = sessionId ? `audio3_sess_${sessionId}` : `audio3_${(nip || cleanName).toLowerCase()}`;
  const label = `${cleanName} (Lewat 40 Menit)`;
  return enqueueAnnouncement(
    dedupeKey,
    label,
    () => executeAudio3(staffName, nip, sessionId),
    { nip, sessionId, employeeName: staffName }
  );
}

// Backward-compatible triggers
export function announceBreakOver(
  staffName: string,
  minutes: number = 40,
  department?: string,
  jobTitle?: string
): Promise<void> {
  if (minutes > 40) {
    return playAudio3UdahLewat40Menit(staffName, jobTitle, department);
  } else {
    return playAudio1Sudah40Menit(staffName, jobTitle, department);
  }
}

async function executeCustomCall(staffName: string, customMessage?: string): Promise<void> {
  await playStationChime();
  const cleanName = formatNameForSpeech(staffName);
  await speakIndonesian(`${cleanName}, ada pesan buat kamu.`, 0.94, 1.0);
  await waitMs(300);
  if (customMessage) {
    await speakIndonesian(customMessage, 0.94, 1.0);
  } else {
    const customAudio = getCustomAudio('audio1');
    if (customAudio) {
      await playAudioElement(customAudio);
    } else {
      await speakIndonesian('Waktu istirahat lu tuh udah habis. Ayo cepat masuk, jualan lagi!', 0.94, 1.0);
    }
  }
  await waitMs(300);
  await playStationOutroChime();
}

export function announceCustomCall(
  staffName: string,
  customMessage?: string,
  _department?: string,
  _jobTitle?: string
): Promise<void> {
  const cleanName = formatNameForSpeech(staffName);
  const dedupeKey = `custom_${cleanName.toLowerCase()}`;
  const label = `${cleanName} (Panggilan Custom)`;
  return enqueueAnnouncement(dedupeKey, label, () => executeCustomCall(staffName, customMessage));
}

/**
 * Test function for studio or preview
 */
export async function testAudioVoiceNote(type: 'audio1' | 'audio2' | 'audio3', sampleName = 'Prima Maelana') {
  if (type === 'audio1') {
    await playAudio1Sudah40Menit(sampleName, 'SMT', 'SMT');
  } else if (type === 'audio2') {
    await playAudio2Sisa5Menit(sampleName, 'SMT', 'SMT');
  } else {
    await playAudio3UdahLewat40Menit(sampleName, 'SMT', 'SMT');
  }
}
