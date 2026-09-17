import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, AlertTriangle, CheckCircle, Clock, Volume2, Search, 
  Filter, Download, ShieldCheck, Megaphone, Coffee, RefreshCw, Trash2, ArrowRight, Settings2,
  VolumeX, Radio
} from 'lucide-react';
import { Employee, BreakSession } from '../types';
import { 
  getTodaySessions, 
  getEmployees, 
  endStaffBreak, 
  clearAllSessions,
  markAlarmPlayed,
  markWarningPlayed,
  markOverduePlayed
} from '../services/breakStorage';
import {
  playAudio1Sudah40Menit,
  playAudio2Sisa5Menit,
  playAudio3UdahLewat40Menit,
  announceCustomCall,
  subscribeAudioQueue,
  AudioQueueStatus
} from '../services/soundService';
import { AudioUnlockBanner } from './AudioUnlockBanner';
import { VoiceStudioModal } from './VoiceStudioModal';

interface ManagerMonitorViewProps {
  currentUser: Employee;
  onRefreshNeeded: () => void;
}

export const ManagerMonitorView: React.FC<ManagerMonitorViewProps> = ({
  currentUser,
  onRefreshNeeded,
}) => {
  const [sessions, setSessions] = useState<BreakSession[]>(() => getTodaySessions());
  const [employees, setEmployees] = useState<Employee[]>(() => getEmployees());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'safe' | 'warning' | 'alert'>('all');
  const [sessionFilter, setSessionFilter] = useState<'all' | '1' | '2'>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'monitoring' | 'history'>('monitoring');
  const [callingNip, setCallingNip] = useState<string | null>(null);
  const [nowTime, setNowTime] = useState<number>(Date.now());
  const [isStudioOpen, setIsStudioOpen] = useState<boolean>(false);
  const [autoAnnounce, setAutoAnnounce] = useState<boolean>(true);
  const [queueStatus, setQueueStatus] = useState<AudioQueueStatus>({
    isProcessing: false,
    queueLength: 0,
    currentTitle: null,
  });

  // Subscribe to Audio Queue status updates
  useEffect(() => {
    const unsubscribe = subscribeAudioQueue((status) => {
      setQueueStatus(status);
    });
    return unsubscribe;
  }, []);

  // Real-time tick every 1 second + automatic store speaker broadcast monitor
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setNowTime(now);
      const currentSessions = getTodaySessions();
      setSessions(currentSessions);
      setEmployees(getEmployees());

      // Auto-broadcast when staff reach 35m, 40m, or 41m
      if (autoAnnounce) {
        currentSessions.forEach((s) => {
          if (s.endTime === null) {
            const elapsedSec = Math.floor((now - s.startTime) / 1000);

            // 1. Audio 2: Peringatan sisa 5 menit (menit ke-35 s.d < 40)
            if (elapsedSec >= 35 * 60 && elapsedSec < 40 * 60 && !s.warningPlayed) {
              markWarningPlayed(s.id);
              playAudio2Sisa5Menit(s.employeeName, s.jobTitle, s.department);
            }

            // 2. Audio 1: Tepat habis 40 menit
            if (elapsedSec >= 40 * 60 && !s.alarmPlayed) {
              markAlarmPlayed(s.id);
              playAudio1Sudah40Menit(s.employeeName, s.jobTitle, s.department);
            }

            // 3. Audio 3: Lewat 40 menit (menit ke-41 ke atas)
            if (elapsedSec >= 41 * 60 && !s.overduePlayed) {
              markOverduePlayed(s.id);
              playAudio3UdahLewat40Menit(s.employeeName, s.jobTitle, s.department);
            }
          }
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [autoAnnounce]);

  // Filter staff currently on break
  const activeBreaks = useMemo(() => {
    return sessions.filter((s) => s.endTime === null);
  }, [sessions]);

  // Filter completed breaks today
  const completedBreaks = useMemo(() => {
    return sessions.filter((s) => s.endTime !== null);
  }, [sessions]);

  // Departments list for filter
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set);
  }, [employees]);

  // Filtered active breaks based on search and status
  const filteredActiveBreaks = useMemo(() => {
    return activeBreaks.filter((s) => {
      const matchSearch =
        s.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.nip.includes(searchQuery) ||
        s.department.toLowerCase().includes(searchQuery.toLowerCase());

      const matchDept = selectedDept === 'all' || s.department === selectedDept;
      const matchSession = sessionFilter === 'all' || s.sessionNumber === Number(sessionFilter);

      const elapsedMinutes = Math.floor((nowTime - s.startTime) / (1000 * 60));
      let matchStatus = true;
      if (statusFilter === 'safe') matchStatus = elapsedMinutes < 30;
      if (statusFilter === 'warning') matchStatus = elapsedMinutes >= 30 && elapsedMinutes < 40;
      if (statusFilter === 'alert') matchStatus = elapsedMinutes >= 40;

      return matchSearch && matchDept && matchSession && matchStatus;
    });
  }, [activeBreaks, searchQuery, selectedDept, statusFilter, sessionFilter, nowTime]);

  // Filtered history
  const filteredHistory = useMemo(() => {
    return sessions.filter((s) => {
      const matchSearch =
        s.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.nip.includes(searchQuery) ||
        s.department.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = selectedDept === 'all' || s.department === selectedDept;
      const matchSession = sessionFilter === 'all' || s.sessionNumber === Number(sessionFilter);
      return matchSearch && matchDept && matchSession;
    });
  }, [sessions, searchQuery, selectedDept, sessionFilter]);

  const totalStaffCount = employees.filter((e) => e.role === 'staff').length;
  const breakCount = activeBreaks.length;
  const activeSesi1Count = activeBreaks.filter((s) => s.sessionNumber === 1).length;
  const activeSesi2Count = activeBreaks.filter((s) => s.sessionNumber === 2).length;
  const totalSesi1Count = sessions.filter((s) => s.sessionNumber === 1).length;
  const totalSesi2Count = sessions.filter((s) => s.sessionNumber === 2).length;

  // Floor congestion warning threshold (e.g. >= 5 staff on break)
  const isFloorRisk = breakCount >= 5;

  const handleSpeakerCall = async (staffName: string, nip: string, department?: string, jobTitle?: string) => {
    setCallingNip(nip);
    await playAudio1Sudah40Menit(staffName, jobTitle, department);
    setCallingNip(null);
  };

  const handleVoiceCall = async (
    type: 'audio1' | 'audio2' | 'audio3',
    staffName: string,
    nip: string,
    jobTitle?: string,
    department?: string
  ) => {
    setCallingNip(`${nip}_${type}`);
    if (type === 'audio1') {
      await playAudio1Sudah40Menit(staffName, jobTitle, department);
    } else if (type === 'audio2') {
      await playAudio2Sisa5Menit(staffName, jobTitle, department);
    } else {
      await playAudio3UdahLewat40Menit(staffName, jobTitle, department);
    }
    setCallingNip(null);
  };

  const handleForceEndBreak = (nip: string, staffName: string) => {
    if (window.confirm(`Akhiri sesi istirahat untuk ${staffName} (NIP: ${nip}) secara manual?`)) {
      endStaffBreak(nip);
      setSessions(getTodaySessions());
      onRefreshNeeded();
    }
  };

  const handleClearAll = () => {
    if (window.confirm('PERHATIAN: Apakah Anda yakin ingin mengosongkan seluruh riwayat istirahat hari ini? Data yang terhapus tidak dapat dikembalikan.')) {
      clearAllSessions();
      setSessions([]);
      onRefreshNeeded();
    }
  };

  const handleExportCSV = () => {
    const today = new Date().toISOString().split('T')[0];
    let csv = 'NIP,Nama Karyawan,Jabatan,Departemen,Toko,Sesi Istirahat,Jam Mulai,Jam Selesai,Durasi (Menit),Status\n';

    sessions.forEach((s) => {
      const startStr = new Date(s.startTime).toLocaleTimeString('id-ID');
      const endStr = s.endTime ? new Date(s.endTime).toLocaleTimeString('id-ID') : 'Masih Istirahat';
      const dur = s.endTime ? s.durationMinutes : Math.round((Date.now() - s.startTime) / 60000);
      const sessionLabel = s.sessionNumber === 1 ? 'Sesi 1 (Istirahat Pertama)' : 'Sesi 2 (Istirahat Kedua)';
      csv += `"${s.nip}","${s.employeeName}","${s.jobTitle}","${s.department}","Informa Alam Sutera","${sessionLabel}","${startStr}","${endStr}",${dur},"${s.endTime ? 'Selesai' : 'Aktif'}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Laporan_Istirahat_Informa_Alam_Sutera_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Speaker audio unlock banner */}
      <AudioUnlockBanner />

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
              Panel Pengawasan Store &amp; HRD
            </span>
            <span className="text-xs font-bold text-[#0033A0]">
              Informa Alam Sutera
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
            Monitoring Istirahat Karyawan
          </h1>
          <p className="text-xs text-slate-500">
            Pantau ketersediaan staf di lantai toko secara real-time agar pelayanan pelanggan tetap optimal.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Auto-announce toggle */}
          <button
            type="button"
            onClick={() => setAutoAnnounce(!autoAnnounce)}
            title={autoAnnounce ? 'Panggilan speaker otomatis aktif' : 'Panggilan speaker otomatis dinonaktifkan'}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer ${
              autoAnnounce
                ? 'bg-blue-50 border-blue-300 text-[#0033A0]'
                : 'bg-slate-100 border-slate-300 text-slate-500'
            }`}
          >
            {autoAnnounce ? (
              <>
                <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                <span>Auto-Speaker: On</span>
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4 text-slate-400" />
                <span>Auto-Speaker: Off</span>
              </>
            )}
          </button>

          {sessions.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              title="Kosongkan seluruh data sesi hari ini"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-red-200 text-red-600 text-xs font-bold shadow-xs hover:bg-red-50 active:scale-95 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
              <span className="hidden sm:inline">Kosongkan Sesi</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsStudioOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold shadow-xs hover:bg-emerald-100 active:scale-95 transition-all cursor-pointer"
          >
            <Settings2 className="w-4 h-4 text-emerald-700" />
            <span>Studio Suara &amp; Rekaman</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold shadow-xs hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-700" />
            <span>Unduh CSV</span>
          </button>
        </div>
      </div>

      {/* Live Audio Queue Status Banner */}
      {queueStatus.isProcessing && (
        <div className="bg-gradient-to-r from-[#0033A0] to-blue-900 text-white rounded-2xl p-4 shadow-md flex items-center justify-between animate-in fade-in border border-blue-400/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center animate-pulse">
              <Volume2 className="w-5 h-5 text-[#FFD100]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-[#FFD100] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Speaker Toko Sedang Mengudara
                </span>
                {queueStatus.queueLength > 0 && (
                  <span className="text-[10px] font-black bg-amber-400 text-[#0033A0] px-2 py-0.5 rounded-full">
                    +{queueStatus.queueLength} antrian berikutnya
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-100 font-medium mt-0.5">
                Sedang dipanggil: <span className="font-bold text-white">{queueStatus.currentTitle}</span>
              </p>
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end text-right text-[11px] text-blue-200">
            <span className="font-semibold text-white">Antrian Suara Teratur</span>
            <span>Diputar berurutan tanpa bertumpuk</span>
          </div>
        </div>
      )}

      {/* Floor Risk Banner (if too many on break) */}
      {isFloorRisk && (
        <div className="bg-red-500 text-white rounded-3xl p-5 shadow-lg border border-red-400 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <h3 className="font-black text-base">
                PERINGATAN: Kepadatan Istirahat Tinggi! ({breakCount} Staf Sedang Istirahat)
              </h3>
              <p className="text-xs text-red-100">
                Terlalu banyak karyawan beristirahat bersamaan. Lantai toko berisiko kekurangan staf untuk melayani pelanggan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3 Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Sedang Istirahat */}
        <div className={`p-5 rounded-3xl border shadow-xs transition-all ${
          breakCount > 5 ? 'bg-red-50 border-red-200' : breakCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Sedang Istirahat Saat Ini
            </span>
            <Coffee className={`w-5 h-5 ${breakCount > 5 ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <div className="text-4xl font-black text-slate-900 mt-2">
            {breakCount} <span className="text-sm font-semibold text-slate-500">dari {totalStaffCount} staf</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-[#0033A0]">
              Sesi 1: {activeSesi1Count}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-900">
              Sesi 2: {activeSesi2Count}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {breakCount === 0 ? 'Semua staf standby di floor toko.' : `${totalStaffCount - breakCount} staf sedang aktif di floor.`}
          </p>
        </div>

        {/* Card 2: Status Floor */}
        <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Status Lantai Toko (Floor)
            </span>
            <ShieldCheck className="w-5 h-5 text-[#00A651]" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`w-3.5 h-3.5 rounded-full ${isFloorRisk ? 'bg-red-500 animate-ping' : 'bg-[#00A651]'}`}></span>
            <span className={`text-2xl font-black ${isFloorRisk ? 'text-red-700' : 'text-emerald-700'}`}>
              {isFloorRisk ? 'Kritis (Kekurangan Staf)' : 'Kondusif & Aman'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Informa Alam Sutera siap beroperasi maksimal.
          </p>
        </div>

        {/* Card 3: Total Sesi Selesai Hari Ini */}
        <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Sesi Selesai Hari Ini
            </span>
            <Clock className="w-5 h-5 text-[#0033A0]" />
          </div>
          <div className="text-4xl font-black text-slate-900 mt-2">
            {completedBreaks.length} <span className="text-sm font-semibold text-slate-500">sesi</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#0033A0]">
              Sesi 1: {totalSesi1Count}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-900">
              Sesi 2: {totalSesi2Count}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {sessions.length} total sesi istirahat tercatat hari ini.
          </p>
        </div>
      </div>

      {/* Tabs & Filter Bar */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-100 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl self-start">
            <button
              onClick={() => setActiveTab('monitoring')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'monitoring'
                  ? 'bg-[#0033A0] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Live Istirahat ({breakCount})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'history'
                  ? 'bg-[#0033A0] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Riwayat Hari Ini ({sessions.length})
            </button>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama / NIP staf..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#0033A0]"
            />
          </div>
        </div>

        {/* Filter Departemen & Durasi */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
              statusFilter === 'all' ? 'bg-[#FFD100] text-blue-950 font-bold' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Semua
          </button>
          <button
            onClick={() => setStatusFilter('safe')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
              statusFilter === 'safe' ? 'bg-emerald-100 text-emerald-900 font-bold' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Aman (&lt; 30 mnt)
          </button>
          <button
            onClick={() => setStatusFilter('warning')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
              statusFilter === 'warning' ? 'bg-amber-100 text-amber-900 font-bold' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Mendekati Batas (30-40 mnt)
          </button>
          <button
            onClick={() => setStatusFilter('alert')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
              statusFilter === 'alert' ? 'bg-red-100 text-red-900 font-bold' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Melebihi 40 Mnt (Alarm)
          </button>

          {/* Filter Sesi Istirahat */}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
            <span className="text-xs font-semibold text-slate-500">Sesi:</span>
            <button
              type="button"
              onClick={() => setSessionFilter('all')}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                sessionFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setSessionFilter('1')}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                sessionFilter === '1'
                  ? 'bg-[#0033A0] text-white shadow-2xs'
                  : 'bg-blue-50 text-[#0033A0] hover:bg-blue-100'
              }`}
            >
              Sesi 1 ({activeTab === 'monitoring' ? activeSesi1Count : totalSesi1Count})
            </button>
            <button
              type="button"
              onClick={() => setSessionFilter('2')}
              className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                sessionFilter === '2'
                  ? 'bg-purple-700 text-white shadow-2xs'
                  : 'bg-purple-50 text-purple-900 hover:bg-purple-100'
              }`}
            >
              Sesi 2 ({activeTab === 'monitoring' ? activeSesi2Count : totalSesi2Count})
            </button>
          </div>

          {departments.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Dept:</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
              >
                <option value="all">Semua Departemen</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'monitoring' ? (
        <div>
          {filteredActiveBreaks.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-xs">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-3">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                Tidak Ada Karyawan yang Sedang Istirahat
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Semua staf standby di area lantai toko (floor) melayani pelanggan Informa Alam Sutera.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredActiveBreaks.map((s) => {
                const elapsedMinutes = Math.floor((nowTime - s.startTime) / (1000 * 60));
                const elapsedSeconds = Math.floor((nowTime - s.startTime) / 1000) % 60;
                const wajibKeluarTime = new Date(s.startTime + 40 * 60 * 1000);
                const wajibKeluarStr = wajibKeluarTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

                // Color code threshold:
                // Green: < 30 mins
                // Yellow: 30 - 40 mins
                // Red: > 40 mins
                let statusColor = 'emerald';
                let statusLabel = 'Waktu Aman';
                let cardBg = 'bg-white border-emerald-200';

                if (elapsedMinutes >= 40) {
                  statusColor = 'red';
                  statusLabel = 'MELEBIHI 40 MENIT (ALARM)';
                  cardBg = 'bg-red-50/80 border-red-300 shadow-md';
                } else if (elapsedMinutes >= 30) {
                  statusColor = 'amber';
                  statusLabel = 'Mendekati Batas (30-40 Mnt)';
                  cardBg = 'bg-amber-50/80 border-amber-200';
                }

                return (
                  <div
                    key={s.id}
                    className={`rounded-3xl p-5 border transition-all flex flex-col justify-between ${cardBg}`}
                  >
                    <div>
                      {/* Top badge */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                          statusColor === 'red'
                            ? 'bg-red-600 text-white animate-pulse'
                            : statusColor === 'amber'
                            ? 'bg-amber-200 text-amber-900'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {statusLabel}
                        </span>
                        <span
                          className={`text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs ${
                            s.sessionNumber === 1
                              ? 'bg-blue-100 text-[#0033A0] border border-blue-200'
                              : 'bg-purple-100 text-purple-900 border border-purple-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              s.sessionNumber === 1 ? 'bg-[#0033A0]' : 'bg-purple-700'
                            }`}
                          ></span>
                          {s.sessionNumber === 1 ? 'Sesi 1 (Pertama)' : 'Sesi 2 (Kedua)'}
                        </span>
                      </div>

                      {/* Staff Name & Title */}
                      <h4 className="text-base font-black text-slate-900 leading-snug">
                        {s.employeeName}
                      </h4>
                      <p className="text-xs text-slate-600 font-medium">
                        {s.jobTitle.toUpperCase() === 'SALES EXECUTIVE' ? 'SMT' : s.jobTitle} &bull; NIP:{' '}
                        <span className="font-mono">{s.nip}</span>
                      </p>
                      <p className="text-[11px] text-[#0033A0] font-semibold mt-0.5">
                        {s.department.toUpperCase() === 'SALES FURNITURE' ? 'SMT' : s.department}
                      </p>

                      {/* Live Running Duration Timer */}
                      <div className="my-3 p-3.5 rounded-2xl bg-white border border-slate-100 text-center shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Lama Istirahat
                        </span>
                        <div
                          className={`text-3xl font-black font-mono tracking-tight my-0.5 ${
                            statusColor === 'red'
                              ? 'text-red-600 animate-pulse'
                              : statusColor === 'amber'
                              ? 'text-amber-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {String(elapsedMinutes).padStart(2, '0')}:{String(elapsedSeconds).padStart(2, '0')}
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          Mulai:{' '}
                          {new Date(s.startTime).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          WIB
                        </span>
                        {/* WAKTU WAJIB KELUAR */}
                        <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] font-bold text-[#0033A0] flex items-center justify-center gap-1">
                          <span>Wajib Kembali:</span>
                          <span className="font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md font-black">
                            {wajibKeluarStr}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 3 Voice Note Quick Call Buttons */}
                    <div className="space-y-2 pt-2 border-t border-slate-200/60">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 px-0.5">
                        <span>Panggil Speaker Toko:</span>
                        {callingNip?.startsWith(s.nip) && (
                          <span className="text-[#0033A0] animate-pulse">Menyiarkan...</span>
                        )}
                      </div>

                      {/* Pilihan 3 Suara Voice Note */}
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleVoiceCall('audio2', s.employeeName, s.nip, s.jobTitle, s.department)}
                          disabled={callingNip !== null}
                          title="Audio 2: Sisa 5 Menit"
                          className="py-1.5 px-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[10px] font-bold text-center active:scale-95 transition-all cursor-pointer"
                        >
                          Sisa 5 Mnt
                        </button>

                        <button
                          type="button"
                          onClick={() => handleVoiceCall('audio1', s.employeeName, s.nip, s.jobTitle, s.department)}
                          disabled={callingNip !== null}
                          title="Audio 1: Waktu Habis (40 Mnt) - Cepat Jualan Lagi!"
                          className="py-1.5 px-1 rounded-lg bg-[#0033A0] hover:bg-[#00257A] text-white text-[10px] font-bold text-center active:scale-95 transition-all cursor-pointer shadow-xs"
                        >
                          Pas 40 Mnt
                        </button>

                        <button
                          type="button"
                          onClick={() => handleVoiceCall('audio3', s.employeeName, s.nip, s.jobTitle, s.department)}
                          disabled={callingNip !== null}
                          title="Audio 3: Lewat 40 Mnt (Masuk ke Floor Sekarang!)"
                          className="py-1.5 px-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[10px] font-bold text-center active:scale-95 transition-all cursor-pointer"
                        >
                          &gt;40 Mnt
                        </button>
                      </div>

                      {/* Tombol Utama Otomatis Sesuai Durasi */}
                      <button
                        type="button"
                        onClick={() => {
                          if (elapsedMinutes >= 40) {
                            handleVoiceCall('audio3', s.employeeName, s.nip, s.jobTitle, s.department);
                          } else if (elapsedMinutes >= 35) {
                            handleVoiceCall('audio1', s.employeeName, s.nip, s.jobTitle, s.department);
                          } else {
                            handleVoiceCall('audio2', s.employeeName, s.nip, s.jobTitle, s.department);
                          }
                        }}
                        disabled={callingNip !== null}
                        className={`w-full py-2 px-2.5 rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                          elapsedMinutes >= 40
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : elapsedMinutes >= 35
                            ? 'bg-[#0033A0] hover:bg-[#00257A] text-white'
                            : 'bg-amber-500 hover:bg-amber-600 text-white'
                        }`}
                      >
                        <Megaphone
                          className={`w-3.5 h-3.5 ${
                            callingNip?.startsWith(s.nip) ? 'animate-bounce text-[#FFD100]' : ''
                          }`}
                        />
                        <span>
                          {callingNip?.startsWith(s.nip)
                            ? 'Menyiarkan...'
                            : elapsedMinutes >= 40
                            ? 'Panggil Darurat (>40 Mnt)'
                            : elapsedMinutes >= 35
                            ? 'Panggil Habis (Jualan Lagi)'
                            : 'Peringatkan (Sisa 5 Mnt)'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleForceEndBreak(s.nip, s.employeeName)}
                        className="w-full py-1 text-[11px] text-slate-400 hover:text-red-700 font-medium transition-colors cursor-pointer"
                      >
                        Tandai Selesai Kembali ke Floor
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* History Tab */
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
          <h3 className="font-bold text-sm text-slate-800 mb-3">
            Rekap Sesi Istirahat Hari Ini ({filteredHistory.length} Log) &bull; Informa Alam Sutera
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Nama Karyawan</th>
                  <th className="p-3">NIP</th>
                  <th className="p-3">Jabatan &amp; Dept</th>
                  <th className="p-3 text-center">Sesi</th>
                  <th className="p-3">Mulai</th>
                  <th className="p-3">Wajib Keluar</th>
                  <th className="p-3">Selesai</th>
                  <th className="p-3 text-right">Durasi</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map((s) => {
                  const wajibStr = new Date(s.startTime + 40 * 60 * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-bold text-slate-900">{s.employeeName}</td>
                      <td className="p-3 font-mono">{s.nip}</td>
                      <td className="p-3">
                        <span className="font-medium">
                          {s.jobTitle.toUpperCase() === 'SALES EXECUTIVE' ? 'SMT' : s.jobTitle}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {s.department.toUpperCase() === 'SALES FURNITURE' ? 'SMT' : s.department}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap shadow-2xs ${
                            s.sessionNumber === 1
                              ? 'bg-blue-100 text-[#0033A0] border border-blue-200'
                              : 'bg-purple-100 text-purple-900 border border-purple-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              s.sessionNumber === 1 ? 'bg-[#0033A0]' : 'bg-purple-700'
                            }`}
                          ></span>
                          {s.sessionNumber === 1 ? 'Sesi 1 (Pertama)' : 'Sesi 2 (Kedua)'}
                        </span>
                      </td>
                      <td className="p-3">{new Date(s.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-3 font-mono font-semibold text-amber-700">{wajibStr}</td>
                      <td className="p-3">
                        {s.endTime ? new Date(s.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        {s.endTime ? `${s.durationMinutes} mnt` : `${Math.round((nowTime - s.startTime) / 60000)} mnt`}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.endTime ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800 animate-pulse'
                        }`}>
                          {s.endTime ? 'Selesai' : 'Aktif'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Voice Studio Modal */}
      <VoiceStudioModal isOpen={isStudioOpen} onClose={() => setIsStudioOpen(false)} />
    </div>
  );
};
