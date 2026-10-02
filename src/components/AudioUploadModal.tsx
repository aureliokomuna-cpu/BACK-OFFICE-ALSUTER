import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Mic,
  Square,
  Play,
  CheckCircle2,
  Volume2,
  Sparkles,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  saveCustomAudio,
  getCustomAudio,
  playAudioElement,
  testAudioVoiceNote,
  unlockAudio,
} from '../services/soundService';

interface AudioUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType?: 'audio2' | 'audio1' | 'audio3';
}

export const AudioUploadModal: React.FC<AudioUploadModalProps> = ({
  isOpen,
  onClose,
  targetType = 'audio2',
}) => {
  const [selectedType, setSelectedType] = useState<'audio2' | 'audio1' | 'audio3'>(targetType);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const currentAudio = getCustomAudio(selectedType);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        saveCustomAudio(selectedType, dataUrl);
        setSuccessMessage(`File "${file.name}" berhasil dipasang & disinkronkan ke semua perangkat!`);
        unlockAudio();
        // Play immediately so user can verify the sound
        setIsPlaying(true);
        await playAudioElement(dataUrl);
        setIsPlaying(false);
      } catch (err: unknown) {
        setErrorMessage('Gagal menyimpan file. Pastikan ukuran file audio wajar (< 25MB).');
      }
    };
    reader.onerror = () => {
      setErrorMessage('Gagal membaca file dari perangkat Anda.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startRecording = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
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
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          saveCustomAudio(selectedType, base64data);
          setSuccessMessage('Rekaman suara berhasil disimpan & disinkronkan ke seluruh perangkat!');
          unlockAudio();
          setIsPlaying(true);
          await playAudioElement(base64data);
          setIsPlaying(false);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      setErrorMessage('Tidak dapat mengakses mikrofon. Berikan izin mikrofon pada browser Anda.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleTestRawSound = async () => {
    if (!currentAudio) return;
    unlockAudio();
    setIsPlaying(true);
    await playAudioElement(currentAudio);
    setIsPlaying(false);
  };

  const handleTestFullAnnouncement = async () => {
    unlockAudio();
    setIsPlaying(true);
    await testAudioVoiceNote(selectedType, 'Prima Maelana');
    setIsPlaying(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0033A0] to-blue-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FFD100] text-blue-950 flex items-center justify-center font-black shadow-md">
              <Volume2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Upload Sound Rekaman Asli</h2>
              <p className="text-xs text-blue-200 font-medium">
                Gunakan file suara Anda untuk alarm sisa 5 menit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Target Selector */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Pilih Jenis Pengumuman:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedType('audio2')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedType === 'audio2'
                    ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="text-[10px] font-black uppercase text-amber-700 block">Menit ke-35</span>
                <span className="text-xs font-black text-slate-900 block leading-tight">Sisa 5 Menit</span>
                <span className="text-[10px] text-slate-500">(Yang Anda Minta)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType('audio1')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedType === 'audio1'
                    ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400/20 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="text-[10px] font-black uppercase text-[#0033A0] block">Menit ke-40</span>
                <span className="text-xs font-black text-slate-900 block leading-tight">40 Menit Habis</span>
                <span className="text-[10px] text-slate-500">(Jualan Lagi)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType('audio3')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedType === 'audio3'
                    ? 'bg-red-50 border-red-400 ring-2 ring-red-400/20 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="text-[10px] font-black uppercase text-red-700 block">&gt; 40 Menit</span>
                <span className="text-xs font-black text-slate-900 block leading-tight">Overdue</span>
                <span className="text-[10px] text-slate-500">(Darurat)</span>
              </button>
            </div>
          </div>

          {/* Expected speech guide */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-amber-900">Kata-kata dalam rekaman:</span>
              <p className="italic text-slate-700 mt-0.5">
                "Hai guys, waktunya 5 menit lagi, siap-siap ya!"
              </p>
              <p className="text-[11px] text-amber-800 mt-1">
                📌 Didahului panggilan otomatis: <em>"[Nama Staf], ada pesan buat kamu."</em>
              </p>
            </div>
          </div>

          {/* Action 1: Upload File from Device */}
          <div className="border-2 border-dashed border-blue-200 rounded-3xl p-5 text-center bg-blue-50/40 hover:bg-blue-50/70 transition-colors">
            <input
              type="file"
              ref={fileInputRef}
              accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.aac"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-[#0033A0] text-white flex items-center justify-center mx-auto mb-3 shadow-md">
              <Upload className="w-6 h-6 text-[#FFD100]" />
            </div>
            <h4 className="text-sm font-black text-slate-800">
              Pilih File Audio yang Anda Miliki
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Format didukung: MP3, M4A (Voice Memos iPhone), WAV, OGG, WebM, AAC.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3.5 py-3 px-6 rounded-2xl bg-[#0033A0] hover:bg-[#00257A] text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4 text-[#FFD100]" />
              <span>Pilih File dari HP / Laptop</span>
            </button>
          </div>

          {/* Action 2: Or Record Mic Directly */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-slate-50">
            <div>
              <h4 className="text-xs font-bold text-slate-800">Atau Rekam Langsung via Mic</h4>
              <p className="text-[11px] text-slate-500">Ucapkan langsung via microphone browser</p>
            </div>
            {isRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md animate-pulse active:scale-95 transition-all cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop ({recordingSeconds}s)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-blue-950 font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Mulai Rekam</span>
              </button>
            )}
          </div>

          {/* Messages */}
          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Audio Test Controls */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
            <span className="text-xs font-bold text-slate-700 block">Uji Bunyi Suara:</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleTestRawSound}
                disabled={isPlaying}
                className="py-2.5 px-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-2xs"
              >
                <Play className={`w-3.5 h-3.5 ${isPlaying ? 'text-[#0033A0] animate-pulse' : 'text-slate-600'}`} />
                <span>Putar Suara Saja</span>
              </button>

              <button
                type="button"
                onClick={handleTestFullAnnouncement}
                disabled={isPlaying}
                className="py-2.5 px-3 rounded-xl bg-[#FFD100] hover:bg-yellow-400 text-blue-950 text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-900" />
                <span>Uji Lengkap Toko</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-center">
              "Uji Lengkap Toko" mensimulasikan nada masuk stasiun + nama staf + suara rekaman Anda.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 text-emerald-600" />
            Sinkron otomatis ke 250 HP Staf & Monitor Manager
          </span>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs active:scale-95 transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
