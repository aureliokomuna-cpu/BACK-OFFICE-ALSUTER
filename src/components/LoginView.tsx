import React, { useState } from 'react';
import { LogIn, KeyRound, User, AlertCircle, FileSpreadsheet, Eye, EyeOff, Lock } from 'lucide-react';
import { Employee } from '../types';
import { findEmployeeByNip } from '../services/breakStorage';
import { unlockAudio, playStoreChime } from '../services/soundService';
import { verifyEmployeePassword } from '../utils/authUtils';

interface LoginViewProps {
  onLoginSuccess: (employee: Employee) => void;
  onOpenSettings: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onOpenSettings,
}) => {
  const [nip, setNip] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    unlockAudio(); // unlock audio on user submission

    const cleanNip = nip.trim();
    const cleanPassword = password.trim();

    if (!cleanNip || !cleanPassword) {
      setErrorMsg('Mohon masukkan NIP dan Kata Sandi Anda.');
      return;
    }

    const employee = findEmployeeByNip(cleanNip);

    if (!employee) {
      setErrorMsg(`NIP "${cleanNip}" tidak terdaftar di sistem Informa Alam Sutera. Silakan periksa kembali NIP Anda.`);
      return;
    }

    // Verify password flexibly: accepts DDMMYYYY (tgl bln tahun lahir), YYYYMM, etc.
    const isValid = verifyEmployeePassword(employee, cleanPassword);
    if (!isValid) {
      setErrorMsg('Kata Sandi salah. Masukkan tanggal, bulan, dan tahun lahir Anda (contoh: 16101989 atau 198910).');
      return;
    }

    playStoreChime();
    onLoginSuccess(employee);
  };

  return (
    <div className="min-h-[calc(100vh-60px)] flex flex-col justify-center items-center px-4 py-8 bg-slate-50">
      <div className="max-w-md w-full">
        {/* Brand Card Top Banner */}
        <div className="bg-[#0033A0] rounded-t-3xl p-7 text-white text-center shadow-lg relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-white/5 pointer-events-none"></div>
          <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-[#FFD100]/10 pointer-events-none"></div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-amber-300 mb-3">
            <span className="w-2 h-2 rounded-full bg-[#00A651]"></span>
            Informa Alam Sutera
          </div>

          <h1 className="text-3xl font-black tracking-wide font-sans text-white">
            INFORMA
          </h1>
          <p className="text-xs text-blue-100 font-medium mt-1">
            Sistem Absensi Istirahat Karyawan Back Office
          </p>
        </div>

        {/* Login Form Container */}
        <div className="bg-white rounded-b-3xl p-7 shadow-xl border border-slate-100 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 font-semibold flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* NIP Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                NIP Karyawan (Employee ID)
              </label>
              <div className="relative">
                <User className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="input-nip"
                  type="text"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  placeholder="Masukkan NIP Anda (Contoh: 103337)"
                  className="w-full pl-11 pr-4 py-3 text-sm font-medium rounded-2xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#0033A0] focus:border-transparent transition-all text-slate-800"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Password Input (Tanggal Bulan Tahun Lahir) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Kata Sandi (Tanggal Bulan Tahun Lahir)
                </label>
              </div>
              <div className="relative">
                <KeyRound className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="input-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contoh: 16101989 (DDMMYYYY) atau 198910"
                  className="w-full pl-11 pr-11 py-3 text-sm font-medium rounded-2xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#0033A0] focus:border-transparent transition-all text-slate-800"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-1"
                  title={showPassword ? 'Sembunyikan' : 'Lihat kata sandi'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Gunakan tanggal, bulan, dan tahun lahir Anda (misal: 16101989 untuk 16 Oktober 1989).
              </p>
            </div>

            {/* Big Action Submit Button */}
            <button
              id="btn-login"
              type="submit"
              className="w-full py-3.5 px-4 rounded-2xl bg-[#0033A0] text-white font-black text-sm hover:bg-[#00257A] active:scale-98 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-[#FFD100]" />
              <span>MASUK ABSENSI</span>
            </button>
          </form>

          {/* Privacy Note: Clean, secure login */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Akses Aman Karyawan
            </span>
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1 text-[#0033A0] hover:underline font-semibold cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Kelola Data Karyawan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
