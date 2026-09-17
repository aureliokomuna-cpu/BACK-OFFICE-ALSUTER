import React, { useState } from 'react';
import { X, FileSpreadsheet, RefreshCw, CheckCircle, AlertTriangle, Download, Upload, Copy, Info } from 'lucide-react';
import { Employee } from '../types';
import { getEmployees, saveEmployees, resetEmployeesToDefault, parseEmployeesFromCSV } from '../services/breakStorage';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmployeesUpdated: (updatedList: Employee[]) => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  onEmployeesUpdated,
}) => {
  const [sheetUrl, setSheetUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'sheet' | 'manual' | 'guide'>('sheet');
  const [csvRawText, setCsvRawText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleFetchGoogleSheets = async () => {
    if (!sheetUrl.trim()) {
      setMessage({ type: 'error', text: 'Silakan masukkan tautan URL Google Sheets CSV yang sudah di-publish.' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      // Fetch the published CSV
      const res = await fetch(sheetUrl.trim());
      if (!res.ok) {
        throw new Error(`Gagal mengambil data (${res.status} ${res.statusText})`);
      }
      const csvData = await res.text();
      const parsed = parseEmployeesFromCSV(csvData);

      if (parsed.length === 0) {
        throw new Error('Tidak ada data karyawan valid yang berhasil dibaca. Pastikan format kolom: Employee ID, Employee Name, Job Title Name, Birth Date.');
      }

      saveEmployees(parsed);
      onEmployeesUpdated(parsed);
      setMessage({
        type: 'success',
        text: `Berhasil mengimpor ${parsed.length} data karyawan dari Google Sheets! Data langsung aktif.`,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat CSV';
      setMessage({
        type: 'error',
        text: `Error: ${errMsg}. Catatan: Pastikan spreadsheet di Google Drive sudah diatur ke 'Publish to the web' format CSV agar tidak diblokir izin akses.`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportRawCsv = () => {
    if (!csvRawText.trim()) {
      setMessage({ type: 'error', text: 'Masukkan teks CSV terlebih dahulu.' });
      return;
    }
    try {
      const parsed = parseEmployeesFromCSV(csvRawText);
      if (parsed.length === 0) {
        setMessage({ type: 'error', text: 'Format CSV tidak dikenali. Gunakan kolom: NIP, Nama, Job Title, Tgl Lahir (DD/MM/YYYY).' });
        return;
      }
      saveEmployees(parsed);
      onEmployeesUpdated(parsed);
      setMessage({ type: 'success', text: `Berhasil mengimpor ${parsed.length} karyawan dari teks CSV!` });
      setCsvRawText('');
    } catch {
      setMessage({ type: 'error', text: 'Gagal memproses teks CSV.' });
    }
  };

  const handleResetDefault = () => {
    if (window.confirm('Kembalikan ke data bawaan 130+ karyawan Informa Area 4 (Alam Sutera & Summarecon)?')) {
      const defaults = resetEmployeesToDefault();
      onEmployeesUpdated(defaults);
      setMessage({ type: 'success', text: 'Data karyawan berhasil dikembalikan ke default Informa Area 4.' });
    }
  };

  const currentList = getEmployees();

  const handleCopySampleFormat = () => {
    const sample = `Employee ID,Employee Name,Job Title Name,Birth Date
166874,AURELIO ADOLF KOMUNA,DEPUTY AREA MANAGER,21/11/1999
103196,ONKY RAMDHANI.,PRODUCT SPECIALIST,11/08/1978
103337,PRIMA MAELANA,SALES EXECUTIVE,16/10/1989
107466,SITI BADRIAH,CASHIER,30/11/1990`;
    navigator.clipboard.writeText(sample);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-[#0033A0] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-[#FFD100]" />
            </div>
            <div>
              <h3 className="font-bold text-base">Kelola Data Karyawan & Google Sheets</h3>
              <p className="text-xs text-blue-100">Informa Area 4 — Alam Sutera & Summarecon ({currentList.length} Karyawan)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2">
          <button
            onClick={() => { setActiveTab('sheet'); setMessage(null); }}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all ${activeTab === 'sheet' ? 'bg-white text-[#0033A0] border-t-2 border-[#0033A0] shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Tautkan Google Sheets (CSV)
          </button>
          <button
            onClick={() => { setActiveTab('manual'); setMessage(null); }}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all ${activeTab === 'manual' ? 'bg-white text-[#0033A0] border-t-2 border-[#0033A0] shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Paste Teks CSV
          </button>
          <button
            onClick={() => { setActiveTab('guide'); setMessage(null); }}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all ${activeTab === 'guide' ? 'bg-white text-[#0033A0] border-t-2 border-[#0033A0] shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Panduan & Speaker Toko
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {message && (
            <div
              className={`p-3.5 rounded-2xl flex items-start gap-2.5 text-xs font-medium ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {activeTab === 'sheet' && (
            <div className="space-y-4">
              <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-100 text-xs text-blue-900 space-y-2">
                <p className="font-semibold flex items-center gap-1.5 text-blue-950">
                  <Info className="w-4 h-4 text-[#0033A0]" />
                  Cara Mempublikasikan Google Sheets sebagai CSV:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-700 pl-1 leading-relaxed">
                  <li>Buka Google Sheets data karyawan Anda.</li>
                  <li>Klik menu <strong>File</strong> &rarr; <strong>Share (Bagikan)</strong> &rarr; <strong>Publish to web (Publikasikan ke web)</strong>.</li>
                  <li>Pilih sheet yang diinginkan, ganti format dari &quot;Web page&quot; menjadi <strong>Comma-separated values (.csv)</strong>.</li>
                  <li>Klik <strong>Publish</strong>, lalu salin URL tautan yang muncul dan tempelkan di bawah ini.</li>
                </ol>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tautan URL Google Sheets CSV Terpublikasi:
                </label>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0033A0] focus:border-transparent font-mono text-slate-800"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleFetchGoogleSheets}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0033A0] text-white text-xs font-bold hover:bg-[#00257A] shadow-xs active:scale-95 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Mengunduh...' : 'Sinkronkan Sekarang'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetDefault}
                  className="text-xs text-slate-600 hover:text-red-700 font-medium underline"
                >
                  Kembalikan ke 130 Karyawan Default
                </button>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Tempelkan teks baris data CSV di bawah ini:</span>
                <button
                  onClick={handleCopySampleFormat}
                  className="text-xs text-[#0033A0] hover:underline flex items-center gap-1 font-semibold"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? 'Tersalin!' : 'Salin Contoh Format'}</span>
                </button>
              </div>
              <textarea
                rows={7}
                value={csvRawText}
                onChange={(e) => setCsvRawText(e.target.value)}
                placeholder="Employee ID,Employee Name,Job Title Name,Birth Date&#10;166874,AURELIO ADOLF KOMUNA,DEPUTY AREA MANAGER,21/11/1999&#10;103196,ONKY RAMDHANI.,PRODUCT SPECIALIST,11/08/1978"
                className="w-full p-3 text-xs font-mono border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#0033A0]"
              />
              <button
                type="button"
                onClick={handleImportRawCsv}
                className="w-full py-2.5 rounded-xl bg-[#00A651] text-white text-xs font-bold hover:bg-emerald-700 active:scale-95 transition-all shadow-xs"
              >
                Terapkan Data Karyawan Baru
              </button>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <h5 className="font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                  🔊 Keterbatasan Autoplay Browser & Audio Speaker Toko
                </h5>
                <p className="text-amber-800">
                  Semua browser modern (Google Chrome, Safari, Edge) memiliki kebijakan keamanan ketat:
                  <strong> browser tidak boleh membunyikan audio otomatis tanpa interaksi fisik user pertama kali</strong> (klik atau tap).
                </p>
                <div className="mt-2 space-y-1 text-slate-800">
                  <p><strong>Solusi yang telah kami terapkan di aplikasi ini:</strong></p>
                  <ul className="list-disc list-inside space-y-0.5 pl-1">
                    <li>Ada tombol <strong>&quot;Uji Panggilan Suara&quot;</strong> atau satu kali klik login yang secara otomatis membuka (unlock) AudioContext browser.</li>
                    <li>Setelah terbuka, timer real-time dapat memanggil Web Speech API dalam bahasa Indonesia tanpa terblokir.</li>
                    <li>Sistem juga memainkan lonceng toko (&quot;Ding-Dong&quot;) sebelum berbicara agar terdengar profesional lewat sound speaker toko.</li>
                    <li>Panggilan suara hanya berbunyi 1 kali pada menit ke-40 per sesi agar tidak mengganggu speaker toko.</li>
                  </ul>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <h5 className="font-bold text-slate-900 mb-1">🔑 Format Kata Sandi Login</h5>
                <p>
                  Username adalah <strong>NIP</strong> (Employee ID). Password adalah <strong>YYYYMM</strong> (Tahun dan Bulan kelahiran).
                  <br />
                  Contoh: Lahir 21 November 1999 &rarr; Password: <code>199911</code>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Total terdaftar: <strong>{currentList.length} karyawan</strong>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-all"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
