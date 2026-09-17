import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Volume2,
  Mic,
  Square,
  Upload,
  Trash2,
  CheckCircle2,
  Play,
  Settings2,
  Sparkles,
  RefreshCw,
  Lock,
  Unlock,
  ShieldCheck,
} from 'lucide-react';
import {
  getSystemVoices,
  getSelectedVoiceURI,
  setSelectedVoiceURI,
  getSpeechPitch,
  setSpeechPitch,
  getSpeechRate,
  setSpeechRate,
  getCustomAudio,
  saveCustomAudio,
  removeCustomAudio,
  isVoiceLocked,
  setVoiceLocked,
  playAudioElement,
  testAudioVoiceNote,
  speakIndonesian,
  unlockAudio,
} from '../services/soundService';

interface VoiceStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AudioType = 'audio1' | 'audio2' | 'audio3';

interface AudioConfig {
  key: AudioType;
  title: string;
  badge: string;
  badgeColor: string;
  expectedText: string;
  timing: string;
}

const AUDIO_CONFIGS: AudioConfig[] = [
  {
    key: 'audio2',
    title: 'Audio 2: Peringatan Sisa 5 Menit',
    badge: 'Menit ke-35',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    expectedText: 'Waktu istirahat lu tinggal lima menit lagi, siap-siap masuk ke floor sekarang!',
    timing: 'Diputar otomatis saat sisa waktu 5 menit lagi',
  },
  {
    key: 'audio1',
    title: 'Audio 1: Waktu Tepat 40 Menit Habis',
    badge: 'Menit ke-40',
    badgeColor: 'bg-[#0033A0]/10 text-[#0033A0] border-[#0033A0]/20',
    expectedText: 'Waktu istirahat lu tuh udah habis, ayo cepat masuk jualan lagi!',
    timing: 'Diputar otomatis pas waktu istirahat 40 menit habis',
  },
  {
    key: 'audio3',
    title: 'Audio 3: Lewat Batas 40 Menit (Darurat)',
    badge: '> 40 Menit',
    badgeColor: 'bg-red-100 text-red-800 border-red-200',
    expectedText: 'Waktu lu tuh udah habis, masuk ke floor sekarang!',
    timing: 'Diputar saat melebihi batas 40 menit',
  },
];

export const VoiceStudioModal: React.FC<VoiceStudioModalProps> = ({ isOpen, onClose }) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedUri, setSelectedUri] = useState<string>('');
  const [pitch, setPitch] = useState<number>(1.0);
  const [rate, setRate] = useState<number>(0.92);
  const [isLocked, setIsLocked] = useState<boolean>(() => isVoiceLocked());
  const [hasCustom, setHasCustom] = useState<Record<AudioType, boolean>>({
    audio1: false,
    audio2: false,
    audio3: false,
  });

  const [recordingType, setRecordingType] = useState<AudioType | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      unlockAudio();
      loadVoicesAndSettings();
      checkCustomAudios();
      setIsLocked(isVoiceLocked());
    }
    return () => {
      stopRecording();
    };
  }, [isOpen]);

  const loadVoicesAndSettings = async () => {
    const list = await getSystemVoices();
    setVoices(list);
    setSelectedUri(getSelectedVoiceURI());
    setPitch(getSpeechPitch());
    setRate(getSpeechRate());
  };

  const checkCustomAudios = () => {
    setHasCustom({
      audio1: Boolean(getCustomAudio('audio1')),
      audio2: Boolean(getCustomAudio('audio2')),
      audio3: Boolean(getCustomAudio('audio3')),
    });
  };

  const handleToggleLock = () => {
    const next = !isLocked;
    setIsLocked(next);
    setVoiceLocked(next);
  };

  const handleSelectVoice = (uri: string) => {
    setSelectedUri(uri);
    setSelectedVoiceURI(uri);
  };

  const handlePitchChange = (newPitch: number) => {
    setPitch(newPitch);
    setSpeechPitch(newPitch);
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    setSpeechRate(newRate);
  };

  const handleTestTtsVoice = async () => {
    unlockAudio();
    setPlayingKey('tts_test');
    // User requested format: "NAMA STAF, ADA PESAN BUAT KAMU"
    await speakIndonesian('Prima Maelana, ada pesan buat kamu. Waktu istirahat lu tuh udah habis. Ayo cepat masuk, jualan lagi!');
    setPlayingKey(null);
  };

  const handleFileUpload = (type: AudioType, e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      alert('File voice sedang dikunci untuk melindungi rekaman Anda. Klik tombol "Buka Kunci" terlebih dahulu jika ingin mengganti file.');
      e.target.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    // Read audio or video file as Data URL
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      try {
        saveCustomAudio(type, dataUrl);
        setIsLocked(true);
        checkCustomAudios();
        alert(`File audio untuk ${type} berhasil disimpan dan otomatis DIKUNCI aman!`);
      } catch (err) {
        alert('Gagal menyimpan file: File terlalu besar. Harap gunakan potongan audio berdurasi pendek (< 15 detik).');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startRecording = async (type: AudioType) => {
    if (isLocked) {
      alert('File voice sedang dikunci untuk melindungi rekaman Anda. Klik tombol "Buka Kunci" terlebih dahulu jika ingin merekam ulang.');
      return;
    }
    try {
      unlockAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          saveCustomAudio(type, base64data);
          setIsLocked(true);
          checkCustomAudios();
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordingType(type);
      setRecordingSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Tidak dapat mengakses mikrofon. Pastikan izin mikrofon telah diberikan pada browser.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setRecordingType(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handlePlayCustomOnly = async (type: AudioType) => {
    const custom = getCustomAudio(type);
    if (custom) {
      setPlayingKey(type);
      await playAudioElement(custom);
      setPlayingKey(null);
    }
  };

  const handlePlayFullPreview = async (type: AudioType) => {
    setPlayingKey(`full_${type}`);
    await testAudioVoiceNote(type, 'Prima Maelana');
    setPlayingKey(null);
  };

  const handleDeleteCustom = (type: AudioType) => {
    if (isLocked) {
      alert('File voice sedang dikunci untuk melindungi rekaman Anda. Klik tombol "Buka Kunci" terlebih dahulu jika ingin menghapus.');
      return;
    }
    if (confirm('Hapus audio kustom ini dan kembali ke suara wanita otomatis?')) {
      removeCustomAudio(type);
      checkCustomAudios();
    }
  };

  if (!isOpen) return null;

  // Filter Indonesian / female voices
  const idVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('id'));
  const otherVoices = voices.filter((v) => !v.lang.toLowerCase().startsWith('id'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="bg-[#0033A0] text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-[#FFD100]">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Studio Suara &amp; Voice Note Informa</h3>
              <p className="text-xs text-blue-100">Sesuaikan karakter suara atau gunakan rekaman suara asli</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
            {/* Section 1: Upload File Audio Asli atau Rekam Sendiri */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4.5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-700" />
                  <h4 className="text-sm font-bold text-emerald-950">Rekaman Voice Note Asli (Terkunci &amp; Aman)</h4>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-full">
                    Prioritas Utama
                  </span>
                </div>
                <p className="text-xs text-emerald-800 mt-1">
                  Bagian depan suara otomatis mengucapkan: <b>"[NAMA STAF], ADA PESAN BUAT KAMU"</b>, lalu langsung dilanjutkan pemutaran file voice note yang sudah Anda upload.
                </p>
              </div>
            </div>

            {/* Voice Lock & Protection Control Card */}
            <div className="p-3 rounded-2xl bg-slate-900 text-white border border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 ${isLocked ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                  {isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold tracking-wide">
                      {isLocked ? 'File Voice: TERKUNCI & DILINDUNGI' : 'File Voice: Kunci Terbuka (Mode Edit)'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isLocked ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30' : 'bg-amber-400/20 text-amber-300 border border-amber-400/30'}`}>
                      {isLocked ? '🔒 PERMANEN AMAN' : '🔓 BISA GANTI / REKAM'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {isLocked
                      ? 'File audio yang Anda upload terkunci aman dan tidak akan tertimpa atau hilang saat reset data.'
                      : 'Kunci terbuka: Anda dapat mengunggah file baru atau merekam ulang audio.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleLock}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  isLocked
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 active:scale-95'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs active:scale-95'
                }`}
              >
                {isLocked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Buka Kunci</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-emerald-200" />
                    <span>Kunci Sekarang</span>
                  </>
                )}
              </button>
            </div>

            {/* Intro Phrase Guarantee Indicator */}
            <div className="bg-white/90 border border-emerald-300/80 rounded-xl p-2.5 flex items-center gap-2 text-xs text-emerald-950 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span>
                Kata pembuka resmi di depan: <b className="text-[#0033A0]">"[Nama Staf], ada pesan buat kamu."</b> (Diikuti pemutaran voice note).
              </span>
            </div>

            {/* 3 Voice Slots */}
            <div className="space-y-3 pt-1">
              {AUDIO_CONFIGS.map((cfg) => {
                const isCustom = hasCustom[cfg.key];
                const isRecThis = recordingType === cfg.key;
                const isPlaying = playingKey === cfg.key || playingKey === `full_${cfg.key}`;

                return (
                  <div
                    key={cfg.key}
                    className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 max-w-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">{cfg.title}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cfg.badgeColor}`}>
                          {cfg.badge}
                        </span>
                        {isCustom ? (
                          <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            {isLocked ? <Lock className="w-3 h-3 text-emerald-600" /> : <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            {isLocked ? 'Terkunci & Aktif' : 'Suara Asli Aktif'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-500">
                            (Suara Wanita Sistem)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 italic">"{cfg.expectedText}"</p>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      {/* Play Preview */}
                      <button
                        type="button"
                        onClick={() => handlePlayFullPreview(cfg.key)}
                        disabled={isPlaying || recordingType !== null}
                        title="Dengarkan pengumuman lengkap: [Nama Staf], ada pesan buat kamu + voice note"
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                      >
                        <Play className={`w-3.5 h-3.5 ${isPlaying ? 'text-[#0033A0] animate-pulse' : ''}`} />
                        <span>{isPlaying ? 'Memutar...' : 'Uji Penuh'}</span>
                      </button>

                      {/* Record Mic */}
                      {isRecThis ? (
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="px-2.5 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold flex items-center gap-1 animate-pulse active:scale-95 transition-all cursor-pointer"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop ({recordingSeconds}s)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startRecording(cfg.key)}
                          disabled={recordingType !== null || isLocked}
                          title={isLocked ? 'Buka kunci terlebih dahulu untuk merekam ulang' : 'Rekam langsung via mic'}
                          className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all ${
                            isLocked
                              ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900 active:scale-95 cursor-pointer'
                          }`}
                        >
                          <Mic className={`w-3.5 h-3.5 ${isLocked ? 'text-slate-400' : 'text-amber-700'}`} />
                          <span>Rekam</span>
                        </button>
                      )}

                      {/* Upload File */}
                      {isLocked ? (
                        <button
                          type="button"
                          onClick={() => alert('File voice sedang dikunci aman. Buka kunci terlebih dahulu di bagian atas jika ingin mengunggah file baru.')}
                          title="Terkunci: Buka kunci terlebih dahulu untuk mengunggah file baru"
                          className="p-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Terkunci</span>
                        </button>
                      ) : (
                        <label className="p-2 rounded-xl bg-[#0033A0]/10 hover:bg-[#0033A0]/20 text-[#0033A0] text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload</span>
                          <input
                            type="file"
                            accept="audio/*,video/mp4,video/webm"
                            className="hidden"
                            onChange={(e) => handleFileUpload(cfg.key, e)}
                          />
                        </label>
                      )}

                      {/* Delete Custom File */}
                      {isCustom && !isLocked && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustom(cfg.key)}
                          title="Hapus rekaman ini dan kembali ke suara sistem"
                          className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Pengaturan Suara Sintesis Wanita (Bila tidak ada rekaman) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Pilihan Suara Wanita Sistem (TTS)</h4>
                <p className="text-xs text-slate-500">
                  Digunakan untuk menyapa nama karyawan atau jika file audio asli belum diupload
                </p>
              </div>
              <button
                type="button"
                onClick={loadVoicesAndSettings}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
                title="Muat ulang daftar suara"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Voice Dropdown */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Pilih Karakter Suara:
              </label>
              <select
                value={selectedUri}
                onChange={(e) => handleSelectVoice(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0033A0]"
              >
                <option value="">Otomatis (Paling Cocok &amp; Suara Wanita)</option>
                {idVoices.length > 0 && (
                  <optgroup label="Bahasa Indonesia">
                    {idVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        🇮🇩 {v.name} {v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('gadis') ? '(Wanita)' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherVoices.length > 0 && (
                  <optgroup label="Suara Lainnya">
                    {otherVoices.slice(0, 8).map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Sliders for Pitch and Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Frekuensi / Nada Suara:</span>
                  <span className="font-mono text-[#0033A0]">{pitch.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.4"
                  step="0.02"
                  value={pitch}
                  onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
                  className="w-full accent-[#0033A0]"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  1.00x adalah nada vokal manusia paling alami &amp; tidak bindeng
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Kecepatan Artikulasi:</span>
                  <span className="font-mono text-[#0033A0]">{rate.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.25"
                  step="0.02"
                  value={rate}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                  className="w-full accent-[#0033A0]"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  0.92x sangat jernih dan tegas untuk pengeras suara toko
                </span>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-700 block">Preset Artikulasi Cepat:</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handlePitchChange(1.0);
                    handleRateChange(0.92);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer text-center ${
                    Math.abs(pitch - 1.0) < 0.03 && Math.abs(rate - 0.92) < 0.03
                      ? 'bg-blue-50 border-[#0033A0] text-[#0033A0]'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Jernih &amp; Jelas (Standar)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handlePitchChange(1.06);
                    handleRateChange(1.0);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer text-center ${
                    Math.abs(pitch - 1.06) < 0.03 && Math.abs(rate - 1.0) < 0.03
                      ? 'bg-blue-50 border-[#0033A0] text-[#0033A0]'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Santai &amp; Cepat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handlePitchChange(0.95);
                    handleRateChange(0.88);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer text-center ${
                    Math.abs(pitch - 0.95) < 0.03 && Math.abs(rate - 0.88) < 0.03
                      ? 'bg-blue-50 border-[#0033A0] text-[#0033A0]'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Tegas &amp; Lambat
                </button>
              </div>
            </div>

            {/* Articulation & Name Reading Guarantee Box */}
            <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-3 text-[11px] text-blue-950 space-y-1">
              <div className="font-bold flex items-center gap-1 text-[#0033A0]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Format Baca Nama Staf Tanpa Dieja:</span>
              </div>
              <p className="text-slate-600">
                Nama karyawan diformat kata demi kata secara penuh dan mengalir lancar (contoh: <b>"Prima Maelana"</b> diucapkan langsung sebagai nama lengkap, bukan dieja <i>P-R-I-M-A</i>). Singkatan divisi <b>SMT</b> diucapkan jelas sebagai <b>"Es Em Te"</b>.
              </p>
            </div>

            {/* Test Voice Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestTtsVoice}
                disabled={playingKey !== null}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-800 text-white hover:bg-slate-900 active:scale-95 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <Volume2 className="w-4 h-4 text-[#FFD100]" />
                <span>{playingKey === 'tts_test' ? 'Sedang Berbicara...' : 'Uji Artikulasi Suara (Nama Lengkap & Panggilan)'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#0033A0] text-white text-xs font-bold hover:bg-[#00257A] active:scale-95 transition-all cursor-pointer shadow-xs"
          >
            Selesai &amp; Simpan
          </button>
        </div>
      </div>
    </div>
  );
};
