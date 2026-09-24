import React, { useState, useEffect } from 'react';
import { LogOut, Settings, ShieldCheck, UserCheck, Clock, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Employee } from '../types';
import { fetchServerState, broadcastCurrentStateToCloud } from '../services/breakStorage';
import { cloudSync } from '../services/cloudSyncService';

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
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<string>('');
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('connecting');

  useEffect(() => {
    const unsub = cloudSync.onStatusChange((status) => {
      setCloudStatus(status);
    });
    return () => unsub();
  }, []);

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

  const handleManualSync = async () => {
    setIsSyncing(true);
    cloudSync.init();
    broadcastCurrentStateToCloud();
    await fetchServerState();
    setIsSyncing(false);
    setSyncNotice('Sinkron!');
    setTimeout(() => setSyncNotice(''), 2000);
  };

  const getStatusBadge = () => {
    if (syncNotice) {
      return (
        <span className="text-emerald-300 font-bold flex items-center gap-1">
          <RefreshCw className="w-3 h-3 animate-spin text-emerald-300" />
          {syncNotice}
        </span>
      );
    }
    if (cloudStatus === 'connected') {
      return (
        <span className="text-emerald-200 font-bold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Cloud Sync Aktif</span>
        </span>
      );
    }
    if (cloudStatus === 'connecting') {
      return (
        <span className="text-amber-200 font-bold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          <span>Menghubungkan...</span>
        </span>
      );
    }
    return (
      <span className="text-red-200 font-bold flex items-center gap-1.5">
        <WifiOff className="w-3 h-3 text-red-300" />
        <span>Hubungkan Ulang</span>
      </span>
    );
  };

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
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Multi-HP Real-time Sync Status Indicator */}
          <button
            type="button"
            onClick={handleManualSync}
            title="Klik untuk sinkronisasi paksa semua HP & Manager via Cloud MQTT"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all active:scale-95 cursor-pointer ${
              cloudStatus === 'connected'
                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/40 text-emerald-200'
                : cloudStatus === 'connecting'
                ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/40 text-amber-200'
                : 'bg-red-500/20 hover:bg-red-500/30 border-red-400/40 text-red-200'
            }`}
          >
            {getStatusBadge()}
            <RefreshCw className={`w-3 h-3 ml-0.5 opacity-80 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>

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
