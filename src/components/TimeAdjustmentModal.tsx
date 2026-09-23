import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Zap,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  Radio,
  Sliders,
  Check,
} from 'lucide-react';
import { BreakSession } from '../types';
import { updateSessionElapsedMinutes } from '../services/breakStorage';
import {
  playAudio1Sudah40Menit,
  playAudio2Sisa5Menit,
  playAudio3UdahLewat40Menit,
  unlockAudio,
} from '../services/soundService';

interface TimeAdjustmentModalProps {
  session: BreakSession | null;
  isOpen: boolean;
  onClose: () => void;
  onTimeUpdated: () => void;
}

export function TimeAdjustmentModal({
  session,
  isOpen,
  onClose,
  onTimeUpdated,
}: TimeAdjustmentModalProps) {
  if (!isOpen || !session) return null;

  const [currentElapsedSec, setCurrentElapsedSec] = useState<number>(() => {
    return Math.max(0, Math.floor((Date.now() - session.startTime) / 1000));
  });
  const [customMinutes, setCustomMinutes] = useState<number>(() => {
    return Math.floor(Math.max(0, Math.floor((Date.now() - session.startTime) / 1000)) / 60);
  });
  const [customSeconds, setCustomSeconds] = useState<number>(0);
  const [resetAlarms, setResetAlarms] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Live timer tick inside modal
  useEffect(() => {
    const timer = setInterval(() => {
      const sec = Math.max(0, Math.floor((Date.now() - session.startTime) / 1000));
      setCurrentElapsedSec(sec);
    }, 1000);
    return () => clearInterval(timer);
  }, [session.startTime]);

  const elapsedM = Math.floor(currentElapsedSec / 60);
  const elapsedS = currentElapsedSec % 60;

  const handleFastForward = async (targetMinutes: number, label: string) => {
    setIsUpdating(true);
    unlockAudio();
    try {
      const res = await updateSessionElapsedMinutes(session.id, targetMinutes, resetAlarms);
      if (res.success) {
        setFeedbackMessage(`Berhasil: ${label}. Perhatikan alarm otomatis!`);
        onTimeUpdated();
        setTimeout(() => setFeedbackMessage(null), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleApplyCustomTime = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    unlockAudio();
    const totalMin = Math.max(0, Number(customMinutes) + Number(customSeconds) / 60);
    try {
      const res = await updateSessionElapsedMinutes(session.id, totalMin, resetAlarms);
      if (res.success) {
        setFeedbackMessage(`Waktu berhasil disetel ke ${customMinutes}m ${customSeconds}s.`);
        onTimeUpdated();
        setTimeout(() => setFeedbackMessage(null), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleTestAudio = (audioType: 1 | 2 | 3) => {
    unlockAudio();
    if (audioType === 2) {
      playAudio2Sisa5Menit(session.employeeName, session.jobTitle, session.department);
    } else if (audioType === 1) {
      playAudio1Sudah40Menit(session.employeeName, session.jobTitle, session.department);
    } else {
      playAudio3UdahLewat40Menit(session.employeeName, session.jobTitle, session.department);
    }
    setFeedbackMessage(`Memutar Audio ${audioType} untuk ${session.employeeName}...`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#0033A0] to-blue-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Sliders className="w-5 h-5 text-[#FFD100]" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">Edit Waktu &amp; Uji Otomatisasi Alarm</h2>
              <p className="text-[11px] text-blue-200">Simulasi &amp; Sinkronisasi HP Real-Time</p>
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
        <div className="p-6 overflow-y-auto space-y-5 text-slate-800 text-sm">
          {/* Staff Info Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-blue-100 text-[#0033A0]">
                {session.sessionNumber === 1 ? 'Sesi 1 (Pertama)' : 'Sesi 2 (Kedua)'}
              </span>
              <h3 className="text-lg font-black text-slate-900 mt-1">{session.employeeName}</h3>
              <p className="text-xs text-slate-500">
                NIP: <span className="font-mono font-bold text-slate-700">{session.nip}</span> &bull;{' '}
                {session.jobTitle} &bull; {session.department}
              </p>
            </div>

            {/* Live Counter Display */}
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Waktu Berjalan</span>
              <div className="text-2xl font-black font-mono text-[#0033A0]">
                {String(elapsedM).padStart(2, '0')}:{String(elapsedS).padStart(2, '0')}
              </div>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                  elapsedM >= 41
                    ? 'bg-red-100 text-red-700'
                    : elapsedM >= 40
                    ? 'bg-red-50 text-red-600'
                    : elapsedM >= 35
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {elapsedM >= 41
                  ? '>40 Mnt (Overdue)'
                  : elapsedM >= 40
                  ? '40 Mnt (Habis)'
                  : elapsedM >= 35
                  ? '35 Mnt (Sisa 5m)'
                  : 'Aman'}
              </span>
            </div>
          </div>

          {/* Feedback banner */}
          {feedbackMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{feedbackMessage}</span>
            </div>
          )}

          {/* SECTION 1: SIMULASI CEPAT (ONE-TAP FAST-FORWARD) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                Lompat Waktu Cepat (Uji Otomatis 10 Detik)
              </h4>
              <span className="text-[11px] text-slate-400">Pilih target:</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tekan salah satu tombol di bawah untuk melompatkan waktu staf ke <b>10 detik sebelum batas</b>. Tunggu 10 detik dan dengarkan alarm berbunyi secara otomatis!
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Button 35 Min */}
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleFastForward(34.833, 'Set ke Menit 34:50')}
                className="p-3 rounded-2xl bg-amber-50 border-2 border-amber-300 hover:bg-amber-100 text-left transition-all active:scale-98 cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-black text-amber-900">Uji 35 Menit</span>
                  <span className="w-2 h-2 rounded-full bg-amber-500 group-hover:animate-ping"></span>
                </div>
                <p className="text-xs font-black text-amber-800">Menit 34:50</p>
                <p className="text-[10px] text-amber-700 mt-1">10 dtk menuju Audio 2 (Sisa 5 Mnt)</p>
              </button>

              {/* Button 40 Min */}
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleFastForward(39.833, 'Set ke Menit 39:50')}
                className="p-3 rounded-2xl bg-blue-50 border-2 border-blue-400 hover:bg-blue-100 text-left transition-all active:scale-98 cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-black text-blue-900">Uji 40 Menit</span>
                  <span className="w-2 h-2 rounded-full bg-blue-600 group-hover:animate-ping"></span>
                </div>
                <p className="text-xs font-black text-[#0033A0]">Menit 39:50</p>
                <p className="text-[10px] text-blue-700 mt-1">10 dtk menuju Audio 1 (Pas 40 Mnt)</p>
              </button>

              {/* Button 41 Min */}
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleFastForward(40.833, 'Set ke Menit 40:50')}
                className="p-3 rounded-2xl bg-red-50 border-2 border-red-400 hover:bg-red-100 text-left transition-all active:scale-98 cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-black text-red-900">Uji &gt;40 Menit</span>
                  <span className="w-2 h-2 rounded-full bg-red-600 group-hover:animate-ping"></span>
                </div>
                <p className="text-xs font-black text-red-700">Menit 40:50</p>
                <p className="text-[10px] text-red-600 mt-1">10 dtk menuju Audio 3 (Lewat Batas)</p>
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleFastForward(0, 'Reset ke Menit 00:00')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset ke Menit 00:00 (Mulai Awal)
              </button>
              <span className="text-[11px] text-slate-400 italic">Otomatis sinkron ke HP staf</span>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* SECTION 2: INPUT MANUAL MENIT & DETIK */}
          <form onSubmit={handleApplyCustomTime} className="space-y-3">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#0033A0]" />
              Setel Menit Manual
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Durasi Berjalan (Menit)
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm font-bold focus:border-[#0033A0] focus:ring-2 focus:ring-blue-100 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Detik Tambahan
                </label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={customSeconds}
                  onChange={(e) => setCustomSeconds(Math.max(0, Math.min(59, parseInt(e.target.value || '0', 10))))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm font-bold focus:border-[#0033A0] focus:ring-2 focus:ring-blue-100 outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="resetAlarmFlag"
                checked={resetAlarms}
                onChange={(e) => setResetAlarms(e.target.checked)}
                className="rounded-md text-[#0033A0] focus:ring-[#0033A0] w-4 h-4 cursor-pointer"
              />
              <label htmlFor="resetAlarmFlag" className="text-xs text-slate-600 font-medium cursor-pointer">
                Reset penanda alarm agar bisa berbunyi kembali saat mencapai menit target
              </label>
            </div>

            <button
              type="submit"
              disabled={isUpdating}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0033A0] hover:bg-[#00257A] text-white font-black text-xs uppercase tracking-wider shadow-md transition-all active:scale-98 cursor-pointer"
            >
              Terapkan Waktu ke Staf Ini
            </button>
          </form>

          <hr className="border-slate-100" />

          {/* SECTION 3: TES SUARA LANGSUNG DENGAN NAMA STAF */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-emerald-600" />
              Tes Suara Instan dengan Nama &amp; Jabatan Staf Ini
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleTestAudio(2)}
                className="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-center transition-colors cursor-pointer"
              >
                <span className="block text-[10px] font-bold text-amber-600">Audio 2</span>
                <span className="text-xs font-black">Sisa 5 Menit</span>
              </button>
              <button
                type="button"
                onClick={() => handleTestAudio(1)}
                className="p-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#0033A0] text-center transition-colors cursor-pointer"
              >
                <span className="block text-[10px] font-bold text-blue-600">Audio 1</span>
                <span className="text-xs font-black">Pas 40 Menit</span>
              </button>
              <button
                type="button"
                onClick={() => handleTestAudio(3)}
                className="p-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-900 text-center transition-colors cursor-pointer"
              >
                <span className="block text-[10px] font-bold text-red-600">Audio 3</span>
                <span className="text-xs font-black">&gt;40 Menit</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Tersinkronisasi ke Semua HP &amp; Layar
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
