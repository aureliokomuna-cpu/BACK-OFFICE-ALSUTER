import React, { useState, useEffect } from 'react';
import { LogOut, Settings, ShieldCheck, UserCheck, Clock, RefreshCw } from 'lucide-react';
import { Employee } from '../types';

interface NavbarProps {
  currentUser: Employee | null;
  onLogout: () => void;
  onOpenSettings: () => void;
  activeView: 'staff' | 'manager';
  onSwitchView: (view: 'staff' | 'manager') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onLogout,
  onOpenSettings,
  activeView,
  onSwitchView,
}) => {
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-[#0033A0] text-white shadow-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand Logo & Store Area */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-wider text-white font-sans">
                INFORMA
              </span>
              <span className="w-2 h-2 rounded-full bg-[#FFD100]"></span>
              <span className="text-xs font-bold text-amber-300 tracking-wide uppercase px-2 py-0.5 rounded-md bg-white/10">
                Area 4
              </span>
            </div>
            <span className="text-[11px] text-blue-100 font-medium hidden sm:inline">
              Informa Alam Sutera &bull; Absensi Istirahat
            </span>
          </div>
        </div>

        {/* Real-time Clock & Actions */}
        <div className="flex items-center gap-3">
          {/* Multi-HP Real-time Sync Status Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-bold text-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Multi-HP Sync Aktif</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs text-blue-100">
            <Clock className="w-3.5 h-3.5 text-[#FFD100]" />
            <span className="font-mono font-medium">{currentTimeStr}</span>
          </div>

          {currentUser && (
            <div className="flex items-center gap-2">
              {/* If user is manager or hrd, allow toggling between monitoring and personal break view */}
              {(currentUser.role === 'manager' || currentUser.role === 'hrd') && (
                <div className="flex items-center bg-black/20 p-0.5 rounded-xl border border-white/10">
                  <button
                    onClick={() => onSwitchView('staff')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      activeView === 'staff' ? 'bg-[#FFD100] text-blue-950 shadow-xs' : 'text-blue-100 hover:text-white'
                    }`}
                  >
                    Istirahat Saya
                  </button>
                  <button
                    onClick={() => onSwitchView('manager')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      activeView === 'manager' ? 'bg-[#FFD100] text-blue-950 shadow-xs' : 'text-blue-100 hover:text-white'
                    }`}
                  >
                    Monitoring
                  </button>
                </div>
              )}

              {/* User badge */}
              <div className="flex items-center gap-2 bg-white/10 pl-2.5 pr-1.5 py-1 rounded-full border border-white/10">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-white leading-tight truncate max-w-[130px]">
                    {currentUser.name.split(' ')[0]}
                  </p>
                  <p className="text-[10px] text-blue-200 uppercase font-mono">
                    NIP {currentUser.nip}
                  </p>
                </div>
                <div className="w-7 h-7 rounded-full bg-[#00A651] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {currentUser.role === 'manager' || currentUser.role === 'hrd' ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                </div>
              </div>

              {/* Settings button */}
              <button
                id="btn-nav-settings"
                type="button"
                onClick={onOpenSettings}
                title="Kelola Data & Google Sheets"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <Settings className="w-4 h-4 text-amber-300" />
              </button>

              {/* Logout button */}
              <button
                id="btn-nav-logout"
                type="button"
                onClick={onLogout}
                title="Keluar / Ganti Akun"
                className="w-8 h-8 rounded-full bg-red-600/80 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-xs"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
