import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, BellRing, Check, Radio, Settings2 } from 'lucide-react';
import { unlockAudio, testAudioVoiceNote } from '../services/soundService';
import { VoiceStudioModal } from './VoiceStudioModal';

interface AudioUnlockBannerProps {
  onAudioReady?: () => void;
}

export const AudioUnlockBanner: React.FC<AudioUnlockBannerProps> = ({ onAudioReady }) => {
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [testingType, setTestingType] = useState<string | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleFirstInteraction = () => {
      unlockAudio();
      setUnlocked(true);
      onAudioReady?.();
    };

    window.addEventListener('click', handleFirstInteraction, { once: true });
    window.addEventListener('touchstart', handleFirstInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [onAudioReady]);

  const handleTest = async (type: 'audio1' | 'audio2' | 'audio3') => {
    setTestingType(type);
    unlockAudio();
    setUnlocked(true);
    await testAudioVoiceNote(type);
    setTestingType(null);
    onAudioReady?.();
  };

  return (
    <>
      <div className="bg-[#0033A0]/10 border border-[#0033A0]/20 rounded-2xl p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-slate-800 shadow-xs">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
              unlocked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {unlocked ? <Radio className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm text-slate-900">Speaker Panggilan Suara Karyawan &amp; SMT</h4>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  unlocked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {unlocked ? 'Speaker Aktif' : 'Perlu Izin Audio'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Otomatis berbunyi pada: <b>Menit ke-35</b> (Sisa 5 mnt), <b>Menit ke-40</b> (Pas habis), dan <b>&gt;40 Menit</b> (Lewat batas). Klik <b>Atur Suara &amp; Rekaman</b> untuk upload file asli atau atur suara.
            </p>
          </div>
        </div>

        {/* 3 Voice Note Quick Testers & Settings */}
        <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
          <button
            id="btn-test-audio2"
            type="button"
            onClick={() => handleTest('audio2')}
            disabled={testingType !== null}
            title="Audio 2: Waktu tinggal 5 menit lagi"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 active:scale-95 transition-all cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5 text-amber-700" />
            <span>{testingType === 'audio2' ? 'Memutar...' : 'Tes Audio 2 (Sisa 5 Mnt)'}</span>
          </button>

          <button
            id="btn-test-audio1"
            type="button"
            onClick={() => handleTest('audio1')}
            disabled={testingType !== null}
            title="Audio 1: Waktu 40 menit pas habis"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0033A0] text-white hover:bg-[#00257A] shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            {testingType === 'audio1' ? (
              <BellRing className="w-3.5 h-3.5 animate-bounce text-[#FFD100]" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
            <span>{testingType === 'audio1' ? 'Memutar...' : 'Tes Audio 1 (Pas 40 Mnt)'}</span>
          </button>

          <button
            id="btn-test-audio3"
            type="button"
            onClick={() => handleTest('audio3')}
            disabled={testingType !== null}
            title="Audio 3: Lewat 40 menit"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-50 border border-red-200 text-red-800 hover:bg-red-100 active:scale-95 transition-all cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5 text-red-600" />
            <span>{testingType === 'audio3' ? 'Memutar...' : 'Tes Audio 3 (>40 Mnt)'}</span>
          </button>

          <button
            id="btn-open-voice-studio"
            type="button"
            onClick={() => setIsStudioOpen(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5 text-[#FFD100]" />
            <span>Atur Suara &amp; Rekaman Asli</span>
          </button>

          {!unlocked && (
            <button
              id="btn-unlock-sound"
              type="button"
              onClick={() => {
                unlockAudio();
                setUnlocked(true);
                onAudioReady?.();
              }}
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Aktifkan</span>
            </button>
          )}
        </div>
      </div>

      <VoiceStudioModal isOpen={isStudioOpen} onClose={() => setIsStudioOpen(false)} />
    </>
  );
};
