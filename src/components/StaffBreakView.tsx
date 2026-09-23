import React, { useState, useEffect } from 'react';
import { Coffee, CheckCircle, Clock, AlertCircle, Volume2, ShieldAlert, User, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Employee, DailyStaffSummary } from '../types';
import {
  getStaffDailySummary,
  startStaffBreak,
  endStaffBreak,
  markAlarmPlayed,
  markWarningPlayed,
  markOverduePlayed,
  subscribeDataChanges,
} from '../services/breakStorage';
import {
  playAudio1Sudah40Menit,
  playAudio2Sisa5Menit,
  playAudio3UdahLewat40Menit,
  playStoreChime,
  unlockAudio,
} from '../services/soundService';

interface StaffBreakViewProps {
  currentUser: Employee;
  onSessionChanged: () => void;
}

export const StaffBreakView: React.FC<StaffBreakViewProps> = ({
  currentUser,
  onSessionChanged,
}) => {
  const [summary, setSummary] = useState<DailyStaffSummary>(() =>
    getStaffDailySummary(currentUser.nip)
  );
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [alertMessage, setAlertMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Sync summary & real-time clock
  const refreshSummary = () => {
    const s = getStaffDailySummary(currentUser.nip);
    setSummary(s);
    if (s.activeSession) {
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - s.activeSession.startTime) / 1000));
      setElapsedSeconds(elapsed);
    } else {
      setElapsedSeconds(0);
    }
  };

  // Multi-device central sync subscription
  useEffect(() => {
    return subscribeDataChanges(() => {
      refreshSummary();
    });
  }, [currentUser]);

  useEffect(() => {
    refreshSummary();

    // 1-second interval for running timer and 40-minute alarm check
    const timer = setInterval(() => {
      const current = getStaffDailySummary(currentUser.nip);
      setSummary(current);

      if (current.activeSession) {
        const now = Date.now();
        const elapsedSec = Math.max(0, Math.floor((now - current.activeSession.startTime) / 1000));
        setElapsedSeconds(elapsedSec);

        // 1. Audio 2: Sisa 5 menit lagi (menit ke-35 s.d < 40)
        if (elapsedSec >= 35 * 60 && elapsedSec < 40 * 60 && !current.activeSession.warningPlayed) {
          current.activeSession.warningPlayed = true;
          markWarningPlayed(current.activeSession.id);
          unlockAudio();
          playAudio2Sisa5Menit(currentUser.name, currentUser.jobTitle, currentUser.department);
          onSessionChanged();
        }

        // 2. Audio 1: Tepat 40 menit habis (menit ke-40 s.d < 41)
        if (elapsedSec >= 40 * 60 && elapsedSec < 41 * 60 && !current.activeSession.alarmPlayed) {
          current.activeSession.alarmPlayed = true;
          markAlarmPlayed(current.activeSession.id);
          unlockAudio();
          playAudio1Sudah40Menit(currentUser.name, currentUser.jobTitle, currentUser.department);
          onSessionChanged();
        }

        // 3. Audio 3: Sudah lewat 40 menit (menit ke-41 ke atas)
        if (elapsedSec >= 41 * 60 && !current.activeSession.overduePlayed) {
          current.activeSession.overduePlayed = true;
          markOverduePlayed(current.activeSession.id);
          unlockAudio();
          playAudio3UdahLewat40Menit(currentUser.name, currentUser.jobTitle, currentUser.department);
          onSessionChanged();
        }
      } else {
        setElapsedSeconds(0);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentUser, onSessionChanged]);

  const formatTimer = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  // Calculate Waktu Wajib Keluar (Start time + 40 minutes)
  const activeSession = summary.activeSession;
  let wajibKeluarStr = '-';
  let waktuMulaiStr = '-';
  let sisaWajibDetik = 0;
  let isOverdue = false;

  if (activeSession) {
    const startTimeDate = new Date(activeSession.startTime);
    waktuMulaiStr = startTimeDate.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB';

    // 40 minutes from start
    const wajibKeluarDate = new Date(activeSession.startTime + 40 * 60 * 1000);
    wajibKeluarStr = wajibKeluarDate.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB';

    const maxSeconds = 40 * 60;
    sisaWajibDetik = maxSeconds - elapsedSeconds;
    isOverdue = sisaWajibDetik <= 0;
  }

  const handleToggleBreak = () => {
    setAlertMessage(null);

    if (summary.isCurrentlyOnBreak) {
      // Selesai Istirahat
      const res = endStaffBreak(currentUser.nip);
      if (res.success) {
        confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.6 },
        });
        setAlertMessage({ type: 'success', text: res.message });
        refreshSummary();
        onSessionChanged();
      } else {
        setAlertMessage({ type: 'error', text: res.message });
      }
    } else {
      // Mulai Istirahat
      const res = startStaffBreak(currentUser);
      if (res.success) {
        playStoreChime();
        setAlertMessage({ type: 'success', text: res.message });
        refreshSummary();
        onSessionChanged();
      } else {
        setAlertMessage({ type: 'error', text: res.message });
      }
    }
  };

  // Sesi 1 & Sesi 2 detection
  const session1 = summary.sessions.find((s) => s.sessionNumber === 1);
  const session2 = summary.sessions.find((s) => s.sessionNumber === 2);

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-4">
      {/* Profil Karyawan (Informa Alam Sutera) */}
      <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-100 flex items-center justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 text-[11px] font-bold text-[#0033A0]">
            <span>Informa Alam Sutera</span>
          </div>
          <h2 className="text-xl font-black text-slate-900 leading-tight">
            {currentUser.name}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            NIP: <span className="font-mono font-bold text-slate-700">{currentUser.nip}</span> &bull;{' '}
            {currentUser.jobTitle.toUpperCase() === 'SALES EXECUTIVE' ? 'SMT' : currentUser.jobTitle}
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-[#0033A0] text-white flex items-center justify-center font-black text-lg shadow-sm">
          {currentUser.name.charAt(0)}
        </div>
      </div>

      {/* PENANDA JATAH 2 KALI ISTIRAHAT (SESI 1 & SESI 2) */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-100">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Jatah 2x Istirahat Hari Ini
          </span>
          <span className="text-xs font-black px-2 py-0.5 rounded-md bg-blue-50 text-[#0033A0]">
            {summary.breakCount}/2 Sesi Terpakai
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Kotak Sesi 1 */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              session1
                ? session1.endTime === null
                  ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400/20 shadow-xs'
                  : 'bg-emerald-50/70 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-black uppercase text-slate-800 flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-[#0033A0] text-white text-[10px] font-black flex items-center justify-center">
                  1
                </span>
                Sesi 1 (Pertama)
              </span>
              <span
                className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                  session1
                    ? session1.endTime === null
                      ? 'bg-blue-600 text-white animate-pulse'
                      : 'bg-emerald-600 text-white'
                    : 'bg-blue-100 text-[#0033A0]'
                }`}
              >
                {session1
                  ? session1.endTime === null
                    ? 'Sedang Aktif'
                    : 'Selesai'
                  : 'Siap Diambil'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              {session1
                ? session1.endTime === null
                  ? `Mulai pk ${new Date(session1.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
                  : `Tuntas ${session1.durationMinutes} mnt (${new Date(session1.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`
                : 'Cek in ke-1 terhitung Sesi 1'}
            </p>
          </div>

          {/* Kotak Sesi 2 */}
          <div
            className={`p-3 rounded-2xl border transition-all ${
              session2
                ? session2.endTime === null
                  ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-400/20 shadow-xs'
                  : 'bg-emerald-50/70 border-emerald-200'
                : session1 && session1.endTime !== null
                ? 'bg-purple-50/70 border-purple-200 border-dashed'
                : 'bg-slate-50 border-slate-200 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-black uppercase text-slate-800 flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-purple-700 text-white text-[10px] font-black flex items-center justify-center">
                  2
                </span>
                Sesi 2 (Kedua)
              </span>
              <span
                className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                  session2
                    ? session2.endTime === null
                      ? 'bg-purple-600 text-white animate-pulse'
                      : 'bg-emerald-600 text-white'
                    : session1 && session1.endTime !== null
                    ? 'bg-purple-100 text-purple-900'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {session2
                  ? session2.endTime === null
                    ? 'Sedang Aktif'
                    : 'Selesai'
                  : session1 && session1.endTime !== null
                  ? 'Siap Diambil'
                  : 'Menunggu Sesi 1'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              {session2
                ? session2.endTime === null
                  ? `Mulai pk ${new Date(session2.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
                  : `Tuntas ${session2.durationMinutes} mnt (${new Date(session2.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`
                : session1 && session1.endTime !== null
                ? 'Cek in ke-2 terhitung Sesi 2'
                : 'Tersedia setelah Sesi 1 selesai'}
            </p>
          </div>
        </div>
      </div>

      {/* Alert / Notification message */}
      {alertMessage && (
        <div
          className={`p-3.5 rounded-2xl flex items-start gap-2.5 text-xs font-semibold ${
            alertMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          {alertMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          )}
          <span>{alertMessage.text}</span>
        </div>
      )}

      {/* KARTU UTAMA ABSENSI (Fokus: Waktu Istirahat & Waktu Wajib Keluar) */}
      <div
        className={`rounded-3xl p-6 text-center border shadow-lg transition-all ${
          summary.isCurrentlyOnBreak
            ? isOverdue
              ? 'bg-gradient-to-b from-red-600 to-red-700 text-white border-red-500'
              : 'bg-gradient-to-b from-[#0033A0] to-[#00257A] text-white border-blue-900'
            : 'bg-white text-slate-800 border-slate-200'
        }`}
      >
        {/* Status Chip & Penanda Sesi */}
        {summary.isCurrentlyOnBreak ? (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider mb-4 shadow-md bg-[#FFD100] text-blue-950">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-900 animate-ping"></span>
            <span>
              {summary.activeSession?.sessionNumber === 1
                ? 'ISTIRAHAT PERTAMA (SESI 1 DARI 2)'
                : 'ISTIRAHAT KEDUA (SESI 2 - TERAKHIR)'}
            </span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 shadow-xs bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00A651]"></span>
            <span className="font-black">Sedang di Floor (Siap Bekerja)</span>
          </div>
        )}

        {summary.isCurrentlyOnBreak ? (
          /* TAMPILAN SAAT SEDANG ISTIRAHAT */
          <div className="space-y-5">
            {/* Waktu Istirahat (Stopwatch) */}
            <div>
              <p className="text-xs uppercase tracking-widest text-blue-200 font-bold">
                Waktu Istirahat Berjalan
              </p>
              <div className="text-6xl font-black font-mono tracking-tight my-1 text-white drop-shadow-md">
                {formatTimer(elapsedSeconds)}
              </div>
              <p className="text-xs text-blue-100 flex items-center justify-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#FFD100]" />
                Mulai istirahat jam <span className="font-bold text-white">{waktuMulaiStr}</span>
              </p>
            </div>

            {/* WAKTU WAJIB KELUAR MEREKA (Highlighted) */}
            <div
              className={`p-4 rounded-2xl border ${
                isOverdue
                  ? 'bg-red-950/80 border-red-400 text-white animate-pulse'
                  : 'bg-white/10 backdrop-blur-md border-white/20 text-white'
              }`}
            >
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-300 block mb-1">
                WAKTU WAJIB KELUAR / KEMBALI KE FLOOR:
              </span>
              <div className="text-3xl font-black tracking-wide text-[#FFD100] font-sans">
                {wajibKeluarStr}
              </div>
              <p className="text-xs mt-1 text-blue-100 font-medium">
                {isOverdue ? (
                  <span className="font-bold text-yellow-200 flex items-center justify-center gap-1">
                    <ShieldAlert className="w-4 h-4 text-yellow-300" />
                    Waktu wajib keluar sudah lewat! Segera kembali ke floor toko.
                  </span>
                ) : (
                  <span>
                    Batas maksimal istirahat 40 menit (Sisa:{' '}
                    <span className="font-bold text-white font-mono">
                      {formatTimer(sisaWajibDetik)}
                    </span>
                    )
                  </span>
                )}
              </p>
            </div>

            {/* Tombol Selesai Istirahat */}
            <button
              id="btn-staff-end-break"
              type="button"
              onClick={handleToggleBreak}
              className="w-full py-4 px-6 rounded-2xl bg-[#FFD100] hover:bg-yellow-400 text-blue-950 font-black text-lg shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle className="w-6 h-6 text-blue-950" />
              <span>SELESAI ISTIRAHAT &amp; KEMBALI KE FLOOR</span>
            </button>
          </div>
        ) : (
          /* TAMPILAN SAAT SEDANG DI FLOOR */
          <div className="space-y-5">
            <div className="py-3">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-[#00A651] mx-auto flex items-center justify-center mb-2">
                <Coffee className="w-8 h-8 text-[#00A651]" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">
                Siap Melayani Pelanggan
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                Tekan tombol di bawah saat Anda akan memulai waktu istirahat back office.
              </p>
            </div>

            {/* Ringkasan Jatah & Batas Waktu */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Batas Waktu Istirahat:</span>
                <span className="font-black text-slate-800">Maksimal 40 Menit / Sesi</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Sisa Jatah Hari Ini:</span>
                <span className="font-black text-[#0033A0]">
                  {summary.breakCount} dari 2 Sesi Terpakai ({summary.remainingMinutes} Menit Tersisa)
                </span>
              </div>
            </div>

            {/* Tombol Mulai Istirahat */}
            <button
              id="btn-staff-start-break"
              type="button"
              onClick={handleToggleBreak}
              disabled={summary.breakCount >= 2 || summary.remainingMinutes <= 0}
              className={`w-full py-4 px-6 rounded-2xl font-black text-base sm:text-lg shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                summary.breakCount >= 2 || summary.remainingMinutes <= 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : summary.breakCount === 0
                  ? 'bg-[#0033A0] hover:bg-[#00257A] text-white shadow-blue-900/20'
                  : 'bg-purple-700 hover:bg-purple-800 text-white shadow-purple-900/20'
              }`}
            >
              <Coffee className="w-6 h-6 text-[#FFD100]" />
              <span>
                {summary.breakCount >= 2
                  ? 'JATAH 2X ISTIRAHAT HARI INI SELESAI (2/2)'
                  : summary.remainingMinutes <= 0
                  ? 'WAKTU ISTIRAHAT TELAH HABIS'
                  : summary.breakCount === 0
                  ? 'MULAI ISTIRAHAT PERTAMA (SESI 1)'
                  : 'MULAI ISTIRAHAT KEDUA (SESI 2)'}
              </span>
            </button>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              {summary.breakCount === 0
                ? '📌 Cek-in pertama hari ini otomatis tercatat sebagai Istirahat Pertama (Sesi 1). Batas 40 menit.'
                : summary.breakCount === 1
                ? '📌 Cek-in kedua hari ini otomatis tercatat sebagai Istirahat Kedua (Sesi 2 - Terakhir). Batas 40 menit.'
                : '✅ Anda telah menuntaskan seluruh 2 sesi istirahat hari ini.'}
            </p>
          </div>
        )}
      </div>

      {/* RIWAYAT ISTIRAHAT HARI INI MILIK SENDIRI */}
      <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-100">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Riwayat Istirahat Saya Hari Ini
        </h3>

        {summary.sessions.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            Belum ada istirahat yang diambil hari ini.
          </p>
        ) : (
          <div className="space-y-2">
            {summary.sessions.map((s) => (
              <div
                key={s.id}
                className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`px-2.5 py-1 rounded-xl font-black text-[11px] flex items-center gap-1 shadow-2xs ${
                      s.sessionNumber === 1
                        ? 'bg-blue-100 text-[#0033A0] border border-blue-200'
                        : 'bg-purple-100 text-purple-900 border border-purple-200'
                    }`}
                  >
                    {s.sessionNumber === 1 ? 'Sesi 1 (Pertama)' : 'Sesi 2 (Kedua)'}
                  </span>
                  <div>
                    <p className="font-bold text-slate-800">
                      {new Date(s.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      {s.endTime
                        ? ` - ${new Date(s.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`
                        : ' - Sedang Berjalan'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {s.endTime ? `Durasi: ${s.durationMinutes} menit` : 'Wajib keluar maks 40 menit'}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    s.endTime ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800 animate-pulse'
                  }`}
                >
                  {s.endTime ? 'Selesai' : 'Aktif'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
