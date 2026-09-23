import React, { useState, useEffect } from 'react';
import { Employee } from './types';
import { Navbar } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { StaffBreakView } from './components/StaffBreakView';
import { ManagerMonitorView } from './components/ManagerMonitorView';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { seedInitialDemoIfEmpty, getEmployees, subscribeDataChanges } from './services/breakStorage';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    try {
      const saved = localStorage.getItem('informa_current_user_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return null;
  });

  const [activeView, setActiveView] = useState<'staff' | 'manager'>('staff');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Initialize demo data if today's log is empty
  useEffect(() => {
    seedInitialDemoIfEmpty();
  }, []);

  // Update view automatically when user logs in
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('informa_current_user_v1', JSON.stringify(currentUser));
      if (currentUser.role === 'manager' || currentUser.role === 'hrd') {
        setActiveView('manager');
      } else {
        setActiveView('staff');
      }
    } else {
      localStorage.removeItem('informa_current_user_v1');
    }
  }, [currentUser]);

  // Listen to multi-device real-time sync and cross-tab BroadcastChannel
  useEffect(() => {
    const unsubscribe = subscribeDataChanges(() => {
      setRefreshKey((prev) => prev + 1);
    });

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('informa_break_channel');
      channel.onmessage = () => {
        setRefreshKey((prev) => prev + 1);
      };
      return () => {
        unsubscribe();
        channel.close();
      };
    }

    return unsubscribe;
  }, []);

  const handleLoginSuccess = (employee: Employee) => {
    setCurrentUser(employee);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveView('staff');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800 selection:bg-[#FFD100] selection:text-blue-950">
      {/* Top Navigation */}
      <Navbar
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenSettings={() => setIsSettingsOpen(true)}
        activeView={activeView}
        onSwitchView={(v) => setActiveView(v)}
      />

      {/* Main View Area */}
      <main className="flex-1 pb-10">
        {!currentUser ? (
          <LoginView
            onLoginSuccess={handleLoginSuccess}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        ) : activeView === 'manager' ? (
          <ManagerMonitorView
            key={`mgr_${refreshKey}`}
            currentUser={currentUser}
            onRefreshNeeded={() => setRefreshKey((prev) => prev + 1)}
          />
        ) : (
          <StaffBreakView
            key={`stf_${refreshKey}`}
            currentUser={currentUser}
            onSessionChanged={() => setRefreshKey((prev) => prev + 1)}
          />
        )}
      </main>

      {/* Brand Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0033A0]">INFORMA</span>
            <span>&bull; Furnishings with Style</span>
            <span className="text-slate-400">Informa Alam Sutera</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Sistem Absensi Istirahat &bull; Maks 40 Menit / Sesi &bull; 2x Per Hari
          </div>
        </div>
      </footer>

      {/* Google Sheets / Employee Data Settings Modal */}
      <GoogleSheetsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onEmployeesUpdated={() => setRefreshKey((prev) => prev + 1)}
      />
    </div>
  );
}
