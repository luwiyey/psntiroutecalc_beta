import React, { useEffect, useState } from 'react';
import { VICE_VERSA } from '../constants';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import NormalCalcOverlay from './NormalCalcOverlay';

interface Props {
  onExit?: () => void;
}

const peso = '\u20B1';
const PWD_VERIFICATION_URL = 'https://pwd.doh.gov.ph/tbl_pwd_id_verificationlist.php';

const SetupScreen: React.FC<Props> = ({ onExit }) => {
  const { activeRoute, settings, setSettings, history, sessions, showToast } = useApp();
  const { authState, logout } = useAuth();
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

  const totalTripLogs = history.reduce((sum, record) => {
    const punchedFare =
      record.punchedFareType === 'discounted' && record.discountedFare > 0
        ? record.discountedFare
        : record.regularFare;
    return sum + punchedFare;
  }, 0);
  const totalTallyGross = sessions.reduce(
    (sessionTotal, session) =>
      sessionTotal +
      session.trips.reduce(
        (tripTotal, trip) =>
          tripTotal +
          trip.sheets.reduce(
            (sheetTotal, sheet) => sheetTotal + sheet.slots.reduce((slotTotal, slot) => slotTotal + slot, 0),
            0
          ),
        0
      ),
    0
  );

  const handleExportAudit = async () => {
    const report = {
      conductor: authState.employeeName,
      employee_id: authState.employeeId,
      date: new Date().toLocaleDateString(),
      financial_summary: {
        manual_logs_gross: `${peso}${totalTripLogs}`,
        waybill_tally_gross: `${peso}${totalTallyGross}`,
        total_combined_gross: `${peso}${totalTripLogs + totalTallyGross}`
      },
      system_meta: {
        total_records: history.length + sessions.length,
        sync_status: isOnline ? 'Synced' : 'Local Only'
      },
      timestamp: new Date().toISOString()
    };

    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    alert("Full audit report copied to clipboard. You can now paste it into your supervisor's message or email.");
  };

  const handleOpenPwdCheck = async () => {
    const openedWindow = window.open(PWD_VERIFICATION_URL, '_blank', 'noopener,noreferrer');
    if (!openedWindow) {
      window.location.href = PWD_VERIFICATION_URL;
    }

    showToast('Official PWD checker opened.', 'info');
  };

  return (
    <div className="flex min-h-full flex-col bg-[#f8f6f6] transition-all dark:bg-black">
      <header className="sticky top-0 z-40 flex shrink-0 items-center justify-between bg-primary px-6 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <span className="material-icons text-2xl text-white">settings</span>
          <div>
            <h1 className="text-xl font-medium tracking-tight text-white">Settings</h1>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/75">{activeRoute.label}</p>
          </div>
        </div>
        <button
          onClick={onExit}
          className="flex items-center justify-center rounded-xl bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
        >
          <span className="material-icons text-lg leading-none">close</span>
        </button>
      </header>

      <div className="space-y-5 p-4">
        <div className="mt-4 flex items-center gap-4 rounded-[1.5rem] bg-white p-5 shadow-md dark:bg-night-charcoal">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
            <span className="material-icons text-xl">badge</span>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Active Conductor</p>
            <p className="text-lg font-black leading-tight dark:text-white">{authState.employeeName}</p>
            <p className="mt-1 text-[10px] font-bold text-slate-400">ID: {authState.employeeId}</p>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Assigned Route</h2>
          <div className="rounded-[1.75rem] bg-primary p-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/70">Current Route</p>
                <h3 className="mt-2 text-lg font-900 leading-tight">{activeRoute.label}</h3>
                <p className="mt-2 text-xs font-bold text-white/80">
                  {activeRoute.stops[0]?.name ?? 'Start'} {VICE_VERSA} {activeRoute.stops[activeRoute.stops.length - 1]?.name ?? 'End'}
                </p>
                <p className="mt-4 text-xs font-bold text-white/70">
                  Route is assigned after login. Logout if you need to sign in with another conductor or choose a different route.
                </p>
              </div>
              <div className="shrink-0 rounded-2xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary">
                Live
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Live Audit</h2>
          <div className="space-y-5 rounded-[1.75rem] bg-white p-6 shadow-md dark:bg-night-charcoal">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="mb-2 text-[10px] font-black uppercase text-slate-400">Trip Logs</p>
                <p className="text-2xl font-900 text-slate-800 dark:text-white">{peso}{totalTripLogs.toLocaleString()}</p>
              </div>
              <div className="border-l pl-6 dark:border-white/10">
                <p className="mb-2 text-[10px] font-black uppercase text-slate-400">Waybill Tally</p>
                <p className="text-2xl font-900 text-green-500">{peso}{totalTallyGross.toLocaleString()}</p>
              </div>
            </div>

              <div className="border-t pt-5 dark:border-white/5">
              <div className="mb-5 flex items-end justify-between">
                <p className="text-[11px] font-black uppercase tracking-widest text-primary">Total Due</p>
                <p className="text-3xl font-900 text-primary">{peso}{(totalTripLogs + totalTallyGross).toLocaleString()}</p>
              </div>
              <button
                onClick={handleExportAudit}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 py-5 text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 dark:bg-black"
              >
                <span className="material-icons text-sm">ios_share</span>
                Generate Remittance Report
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Tools</h2>
          <div className="rounded-2xl bg-white shadow-md dark:bg-night-charcoal">
            <button
              onClick={() => setIsCalculatorOpen(true)}
              className="flex w-full items-center justify-between p-5 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary">
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
          <h2 className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">ID Check</h2>
          <div className="rounded-2xl bg-white p-5 shadow-md dark:bg-night-charcoal">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <span className="material-icons">verified_user</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold dark:text-white">PWD ID Verification</p>
                <p className="mt-1 text-xs text-slate-500">
                  Open the official DOH website to verify a PWD ID. Internet is required.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={handleOpenPwdCheck}
                className="w-full rounded-2xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-[0.98]"
              >
                Open Official Check
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-black/30">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Needs Internet</p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-300">
                The app cannot auto-fill or read the DOH result directly because the official site blocks in-app embedding and automated lookup.
              </p>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-black/30">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Senior Citizen</p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-300">
                Closed for now. Only the official PWD checker is available in this section.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Preferences</h2>
          <div className="rounded-2xl bg-white shadow-md dark:bg-night-charcoal">
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary">
                  <span className="material-icons">dark_mode</span>
                </div>
                <div>
                  <p className="font-bold dark:text-white">Night Shift</p>
                  <p className="text-xs text-slate-500">Dark background mode</p>
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={settings.isNightMode} onChange={toggleNightMode} className="peer sr-only" />
                <div className="h-6 w-11 rounded-full bg-slate-200 transition-all after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full dark:bg-slate-700" />
              </label>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Session</h2>
          <div className="rounded-2xl bg-white shadow-md dark:bg-night-charcoal">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-white/5">
              <div>
                <p className="font-bold dark:text-white">Remember Login</p>
                <p className="text-xs text-slate-500">This browser and phone will keep this conductor signed in until logout.</p>
              </div>
              <span className="rounded-2xl bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                Saved
              </span>
            </div>
            <button
              onClick={logout}
              className="flex w-full items-center justify-between p-5 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary">
                  <span className="material-icons">logout</span>
                </div>
                <div className="text-left">
                  <p className="font-bold dark:text-white">Logout</p>
                  <p className="text-xs text-slate-500">Switch to another conductor account on this phone</p>
                </div>
              </div>
              <span className="material-icons text-slate-400">chevron_right</span>
            </button>
          </div>
        </section>

      </div>

      <footer className="px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1">
        <a
          href="https://www.facebook.com/suppsiang/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 text-center text-[11px] font-semibold text-slate-400 transition-all active:scale-[0.99] dark:text-slate-500"
        >
          <span>Developed by Zia Louise Mariano</span>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current text-[#1877F2]" aria-hidden="true">
            <path d="M22 12.07C22 6.5 17.52 2 12 2S2 6.5 2 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47H15.2c-1.24 0-1.63.78-1.63 1.58v1.89h2.77l-.44 2.9h-2.33V22c4.78-.75 8.43-4.91 8.43-9.93z"/>
          </svg>
        </a>
      </footer>

      <NormalCalcOverlay isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
    </div>
  );
};

export default SetupScreen;
