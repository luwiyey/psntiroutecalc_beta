import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import NormalCalcOverlay from './NormalCalcOverlay';

interface Props {
  onExit?: () => void;
}

const SetupScreen: React.FC<Props> = ({ onExit }) => {
  const { settings, setSettings, history, sessions } = useApp();
  const { authState } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, []);

  const toggleNightMode = () => {
    setSettings(prev => ({ ...prev, isNightMode: !prev.isNightMode }));
  };

  const totalTripLogs = history.reduce((a, b) => a + b.regularFare, 0);
  const totalTallyGross = sessions.reduce((acc, s) => 
    acc + s.trips.reduce((tAcc, t) => 
      tAcc + t.sheets.reduce((shAcc, sh) => shAcc + sh.slots.reduce((a, b) => a + b, 0), 0)
    , 0)
  , 0);

  const handleExportAudit = () => {
    const report = {
      conductor: authState.employeeName,
      employee_id: authState.employeeId,
      date: new Date().toLocaleDateString(),
      financial_summary: {
        manual_logs_gross: `₱${totalTripLogs}`,
        waybill_tally_gross: `₱${totalTallyGross}`,
        total_combined_gross: `₱${totalTripLogs + totalTallyGross}`
      },
      system_meta: {
        total_records: history.length + sessions.length,
        device_id: authState.deviceId,
        sync_status: isOnline ? 'Synced' : 'Local Only'
      },
      timestamp: new Date().toISOString()
    };
    
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    alert('Full Audit Report copied to clipboard! You can now paste this into your supervisor\'s message or email.');
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in bg-[#f8f6f6] dark:bg-black transition-all">
      {/* Red Header - Exactly as requested */}
      <header className="shrink-0 bg-primary flex items-center justify-between px-6 py-4 shadow-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="material-icons text-white text-2xl">settings</span>
          <h1 className="text-xl font-medium text-white tracking-tight">Settings</h1>
        </div>
        <button 
          onClick={onExit}
          className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-xl transition-colors flex items-center justify-center"
        >
          <span className="material-icons text-lg leading-none">close</span>
        </button>
      </header>

      <div className="p-4 space-y-6 pb-24">
        <div className={`bg-white dark:bg-night-charcoal rounded-2xl shadow-sm border border-primary/5 flex items-center transition-all mt-4 p-5 gap-4`}>
          <div className={`bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg transition-all w-12 h-12`}>
            <span className={`material-icons text-xl`}>badge</span>
          </div>
          <div>
            <p className="text-[10px] font-black text-primary uppercase tracking-widest">Active Conductor</p>
            <p className={`font-black leading-tight dark:text-white text-lg`}>{authState.employeeName}</p>
            <p className={`text-[10px] font-bold text-slate-400 mt-1`}>ID: {authState.employeeId}</p>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Live Audit</h2>
          <div className={`bg-white dark:bg-night-charcoal rounded-3xl border border-primary/5 space-y-6 shadow-sm transition-all p-6`}>
            <div className="grid grid-cols-2 gap-6">
               <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Trip Logs</p>
                 <p className={`font-900 text-slate-800 dark:text-white text-2xl`}>₱{totalTripLogs.toLocaleString()}</p>
               </div>
               <div className="border-l pl-6 dark:border-white/10">
                 <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Waybill Tally</p>
                 <p className={`font-900 text-green-500 text-2xl`}>₱{totalTallyGross.toLocaleString()}</p>
               </div>
            </div>
            
            <div className="pt-6 border-t dark:border-white/5">
               <div className="flex justify-between items-end mb-6">
                  <p className="text-[11px] font-black text-primary uppercase tracking-widest">Total Due</p>
                  <p className={`font-900 text-primary text-3xl`}>₱{(totalTripLogs + totalTallyGross).toLocaleString()}</p>
               </div>
               <button 
                 onClick={handleExportAudit}
                 className={`w-full bg-zinc-900 dark:bg-black text-white rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 active:scale-95 shadow-xl transition-all py-5`}
               >
                 <span className="material-icons text-sm">ios_share</span>
                 Generate Remittance Report
               </button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tools</h2>
          <div className="bg-white dark:bg-night-charcoal rounded-2xl border border-primary/5 shadow-sm">
            <button
              onClick={() => setIsCalculatorOpen(true)}
              className="w-full flex items-center justify-between transition-all p-5 active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 text-primary p-3 rounded-xl">
                  <span className="material-icons">calculate</span>
                </div>
                <div className="text-left">
                  <p className="font-bold dark:text-white">Calculator</p>
                  <p className="text-xs text-slate-500">Open a standard calculator</p>
                </div>
              </div>
              <span className="material-icons text-slate-400">chevron_right</span>
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Preferences</h2>
          <div className="bg-white dark:bg-night-charcoal rounded-2xl border border-primary/5 divide-y dark:divide-white/5 shadow-sm">
            <div className={`flex items-center justify-between transition-all p-5`}>
              <div className="flex items-center gap-4">
                <div className={`bg-primary/10 text-primary p-3 rounded-xl`}><span className="material-icons">dark_mode</span></div>
                <div>
                  <p className={`font-bold dark:text-white`}>Night Shift</p>
                  <p className={`text-xs text-slate-500`}>Dark background mode</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.isNightMode} onChange={toggleNightMode} className="sr-only peer" />
                <div className={`bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-primary transition-all w-11 h-6 after:h-5 after:w-5 after:top-[2px] after:left-[2px] after:content-[''] after:absolute after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-full`} />
              </label>
            </div>
          </div>
        </section>
      </div>

      <NormalCalcOverlay
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />
    </div>
  );
};

export default SetupScreen;
