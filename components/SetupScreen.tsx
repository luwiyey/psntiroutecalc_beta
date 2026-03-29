import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import NormalCalcOverlay from './NormalCalcOverlay';
import StopCalibrationOverlay from './StopCalibrationOverlay';
import StopReminderOverlay from './StopReminderOverlay';
import SupportContactSheet from './SupportContactSheet';
import HelpHint from './HelpHint';
import { trackAnalyticsEvent } from '../utils/analytics';

interface Props {
  onExit?: () => void;
}

const peso = '\u20B1';
const PWD_VERIFICATION_URL = 'https://pwd.doh.gov.ph/tbl_pwd_id_verificationlist.php';
type AuditScope = 'shift' | 'today' | 'route' | 'all';

const SetupScreen: React.FC<Props> = ({ onExit }) => {
  const {
    activeRoute,
    settings,
    setSettings,
    history,
    sessions,
    verifiedStops,
    stopSyncState,
    syncStopSubmissions,
    currentShift,
    shiftHistory,
    startShift,
    endShift,
    stopReminders,
    reminderSettings,
    showToast
  } = useApp();
  const { authState, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isStopCalibrationOpen, setIsStopCalibrationOpen] = useState(false);
  const [isStopReminderOpen, setIsStopReminderOpen] = useState(false);
  const [auditScope, setAuditScope] = useState<AuditScope>('shift');

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

  const toggleFloatingVoice = () => {
    setSettings(prev => ({ ...prev, floatingVoiceEnabled: !prev.floatingVoiceEnabled }));
  };

  const activeShiftForRoute = currentShift?.routeId === activeRoute.id ? currentShift : null;
  const routeSessions = sessions.filter(session => session.routeId === activeRoute.id);
  const routeHistory = history.filter(record => record.routeId === activeRoute.id);
  const shiftHistoryRecords = activeShiftForRoute
    ? routeHistory.filter(record => record.shiftId === activeShiftForRoute.id)
    : [];
  const shiftSessions = activeShiftForRoute
    ? routeSessions.filter(session => session.shiftId === activeShiftForRoute.id)
    : [];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = startOfToday.getTime() + 24 * 60 * 60 * 1000;
  const isToday = (value: number) => value >= startOfToday.getTime() && value < endOfToday;
  const getPunchedFare = (record: typeof history[number]) =>
    record.punchedFareType === 'discounted' && record.discountedFare > 0
      ? record.discountedFare
      : record.regularFare;
  const getSessionGross = (session: typeof sessions[number]) =>
    session.trips.reduce(
      (sessionTotal, trip) =>
        sessionTotal +
        trip.sheets.reduce(
          (tripTotal, sheet) => tripTotal + sheet.slots.reduce((sheetTotal, slot) => sheetTotal + slot, 0),
          0
        ),
      0
    );
  const getSessionActivityAt = (session: typeof sessions[number]) => {
    const sessionTimestamp = Date.parse(session.date);
    const latestSheetUpdate = session.trips.reduce((sessionLatest, trip) => {
      return Math.max(
        sessionLatest,
        ...trip.sheets.map(sheet => sheet.lastUpdatedAt ?? 0)
      );
    }, 0);

    return Math.max(Number.isNaN(sessionTimestamp) ? 0 : sessionTimestamp, latestSheetUpdate);
  };
  const todayHistory = history.filter(record => isToday(record.timestamp));
  const todaySessions = sessions.filter(session => isToday(getSessionActivityAt(session)));
  const auditCollection = (() => {
    switch (auditScope) {
      case 'today':
        return {
          label: 'Today',
          historyRecords: todayHistory,
          sessionRecords: todaySessions
        };
      case 'route':
        return {
          label: 'This Route',
          historyRecords: routeHistory,
          sessionRecords: routeSessions
        };
      case 'all':
        return {
          label: 'All Saved Data',
          historyRecords: history,
          sessionRecords: sessions
        };
      case 'shift':
      default:
        return {
          label: 'Current Shift',
          historyRecords: shiftHistoryRecords,
          sessionRecords: shiftSessions
        };
    }
  })();
  const totalTripLogs = auditCollection.historyRecords.reduce((sum, record) => {
    return sum + getPunchedFare(record);
  }, 0);
  const totalTallyGross = auditCollection.sessionRecords.reduce(
    (sum, session) => sum + getSessionGross(session),
    0
  );
  const calibratedStopCount = activeRoute.stops.filter(stop => (stop.calibrationSamples ?? 0) > 0).length;
  const verifiedStopCount = verifiedStops.length;
  const completedRouteShiftCount = shiftHistory.filter(
    shift => shift.routeId === activeRoute.id && shift.status === 'closed'
  ).length;
  const routeReminderCount = stopReminders.filter(
    reminder => reminder.routeId === activeRoute.id && reminder.status !== 'done'
  ).length;
  const lastClosedShiftForRoute = [...shiftHistory]
    .filter(shift => shift.routeId === activeRoute.id && shift.status === 'closed' && shift.endedAt)
    .sort((a, b) => b.endedAt - a.endedAt)[0];
  const formatShiftTimestamp = (timestamp?: number | null) =>
    timestamp ? new Date(timestamp).toLocaleString() : 'Not recorded yet';

  const handleExportAudit = async () => {
    if (auditScope === 'shift' && !activeShiftForRoute) {
      showToast('Start a shift first before generating a remittance report.', 'info');
      return;
    }

    const report = {
      conductor: authState.employeeName,
      employee_id: authState.employeeId,
      date: new Date().toLocaleDateString(),
      audit_scope: auditCollection.label,
      shift: activeShiftForRoute ? {
        id: activeShiftForRoute.id,
        route: activeShiftForRoute.routeLabel,
        started_at: new Date(activeShiftForRoute.startedAt).toISOString(),
        ended_at: activeShiftForRoute.endedAt ? new Date(activeShiftForRoute.endedAt).toISOString() : null,
        status: activeShiftForRoute.status
      } : null,
      financial_summary: {
        manual_logs_gross: `${peso}${totalTripLogs}`,
        waybill_tally_gross: `${peso}${totalTallyGross}`,
        total_combined_gross: `${peso}${totalTripLogs + totalTallyGross}`
      },
      system_meta: {
        total_records: auditCollection.historyRecords.length + auditCollection.sessionRecords.length,
        verified_stops: verifiedStopCount,
        sync_status: isOnline ? 'Synced' : 'Local Only'
      },
      timestamp: new Date().toISOString()
    };

    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    void trackAnalyticsEvent({
      eventType: 'audit_exported',
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      routeId: activeRoute.id,
      routeLabel: activeRoute.label,
      appSurface: 'setup',
      metadata: {
        shiftId: activeShiftForRoute?.id ?? null,
        auditScope,
        historyGross: totalTripLogs,
        tallyGross: totalTallyGross,
        combinedGross: totalTripLogs + totalTallyGross,
        historyCount: auditCollection.historyRecords.length,
        sessionCount: auditCollection.sessionRecords.length
      }
    });
    alert("Full audit report copied to clipboard. You can now paste it into your supervisor's message or email.");
  };

  const handleOpenPwdCheck = async () => {
    if (!navigator.onLine) {
      showToast('Internet is needed to open the official PWD checker.', 'info');
      return;
    }

    const openedWindow = window.open(PWD_VERIFICATION_URL, '_blank', 'noopener,noreferrer');
    if (!openedWindow) {
      window.location.href = PWD_VERIFICATION_URL;
    }

    showToast('Official PWD checker opened.', 'info');
    void trackAnalyticsEvent({
      eventType: 'pwd_checker_opened',
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      routeId: activeRoute.id,
      routeLabel: activeRoute.label,
      appSurface: 'setup'
    });
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
        <section className="mt-4 overflow-hidden rounded-[1.75rem] bg-white shadow-md dark:bg-night-charcoal">
          <div className="bg-primary p-5 text-white">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                <span className="material-icons text-xl">badge</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Active Conductor</p>
                <p className="mt-1 truncate text-lg font-black leading-tight">{authState.employeeName}</p>
                <p className="mt-1 text-[10px] font-bold text-white/80">ID: {authState.employeeId}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 dark:bg-black/30">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Current Route</p>
              <h2 className="mt-2 text-lg font-900 leading-tight text-slate-800 dark:text-white">{activeRoute.label}</h2>
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                Route is assigned after login. Logout if you need to switch conductor or choose a different route.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-4 dark:border-white/5">
              <div className="pr-4">
                <p className="font-bold dark:text-white">Remember Login</p>
                <p className="text-xs text-slate-500 dark:text-slate-300">This phone keeps this conductor signed in until logout.</p>
              </div>
              <span className="shrink-0 rounded-2xl bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                Saved
              </span>
            </div>

            <button
              onClick={logout}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-100 px-4 py-4 transition-all active:scale-[0.99] dark:border-white/5"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary">
                  <span className="material-icons">logout</span>
                </div>
                <div className="text-left">
                  <p className="font-bold dark:text-white">Logout</p>
                  <p className="text-xs text-slate-500 dark:text-slate-300">Switch to another conductor account on this phone</p>
                </div>
              </div>
              <span className="material-icons text-slate-400">chevron_right</span>
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <HelpHint
              label="Start Shift opens a timed trip session for this route. End Shift closes it. The app records when it started and when it ended."
                triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
            >
              Shift Control
            </HelpHint>
          </div>
          <div className="space-y-4 rounded-[1.75rem] bg-white p-6 shadow-md dark:bg-night-charcoal">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Shift</p>
                <p className="mt-2 text-2xl font-900 text-slate-800 dark:text-white">
                  {activeShiftForRoute ? 'OPEN' : 'NOT STARTED'}
                </p>
                <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-300">
                  {activeShiftForRoute
                    ? 'This route is currently recording logs and tally totals inside one active shift.'
                    : 'Start a shift so remittance, logs, and tally totals only count this trip.'}
                </p>
              </div>
              <span className={`rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-widest ${
                activeShiftForRoute
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
              }`}>
                {activeShiftForRoute ? 'Running' : 'Idle'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-slate-50 px-4 py-4 dark:bg-black/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Started At</p>
                <p className="mt-2 text-sm font-black text-slate-800 dark:text-white">
                  {activeShiftForRoute ? formatShiftTimestamp(activeShiftForRoute.startedAt) : 'Tap Start Shift'}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4 dark:bg-black/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Last Ended Shift</p>
                <p className="mt-2 text-sm font-black text-slate-800 dark:text-white">
                  {lastClosedShiftForRoute ? formatShiftTimestamp(lastClosedShiftForRoute.endedAt) : 'No closed shift yet'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-slate-50 px-4 py-4 dark:bg-black/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Route Shifts Closed</p>
                <p className="mt-2 text-xl font-black text-slate-800 dark:text-white">{completedRouteShiftCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4 dark:bg-black/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Logs This Shift</p>
                <p className="mt-2 text-xl font-black text-slate-800 dark:text-white">{shiftHistoryRecords.length}</p>
              </div>
            </div>

            <button
              onClick={activeShiftForRoute ? endShift : startShift}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl py-5 text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 ${
                activeShiftForRoute ? 'bg-zinc-900 dark:bg-black' : 'bg-primary'
              }`}
            >
              <span className="material-icons text-sm">{activeShiftForRoute ? 'flag' : 'play_arrow'}</span>
              {activeShiftForRoute ? 'End Shift' : 'Start Shift'}
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <details className="group rounded-[1.75rem] bg-white shadow-md dark:bg-night-charcoal">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <HelpHint
                    label="Audit shows totals from fare logs and tally sessions. Use the scope buttons inside to switch between current shift, today, this route, or all saved data."
                triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
                  >
                    Live Audit
                  </HelpHint>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-300">Open remittance totals only when you need them.</p>
              </div>
              <span className="material-icons text-slate-400 transition-transform group-open:rotate-180">expand_more</span>
            </summary>
            <div className="space-y-5 border-t border-slate-100 p-6 dark:border-white/5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                { id: 'shift', label: 'Current Shift' },
                { id: 'today', label: 'Today' },
                { id: 'route', label: 'This Route' },
                { id: 'all', label: 'All Saved' }
              ] as Array<{ id: AuditScope; label: string }>).map(option => (
                <button
                  key={option.id}
                  onClick={() => setAuditScope(option.id)}
                  className={`rounded-2xl px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                    auditScope === option.id
                      ? 'bg-primary text-white shadow-md'
                      : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {auditScope === 'shift' && !activeShiftForRoute && (
              <div className="rounded-2xl bg-slate-50 px-4 py-4 text-xs font-semibold text-slate-500 dark:bg-black/30 dark:text-slate-300">
                Shift totals stay at zero until you tap <span className="font-black text-primary">Start Shift</span>.
              </div>
            )}

            <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-black/30">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">{auditCollection.label}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-300">
                {auditCollection.historyRecords.length} fare logs and {auditCollection.sessionRecords.length} tally sessions are included in this view.
              </p>
            </div>

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
                disabled={auditScope === 'shift' && !activeShiftForRoute}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 py-5 text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 disabled:opacity-40 dark:bg-black"
              >
                <span className="material-icons text-sm">ios_share</span>
                {auditScope === 'shift' ? 'Generate Remittance Report' : 'Copy Audit Snapshot'}
              </button>
            </div>
            </div>
          </details>
        </section>

        <section className="space-y-3">
          <details className="group rounded-[1.75rem] bg-white shadow-md dark:bg-night-charcoal">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <HelpHint
                    label="Tools contains extra actions like the calculator, stop calibration, and drop-off alerts. These are not needed on every trip, so they stay collapsed until opened."
                triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
                  >
                    Tools
                  </HelpHint>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-300">Open extra tools only when you need them.</p>
              </div>
              <span className="material-icons text-slate-400 transition-transform group-open:rotate-180">expand_more</span>
            </summary>
            <div className="border-t border-slate-100 dark:border-white/5">
            <button
              onClick={() => setIsCalculatorOpen(true)}
              className="flex w-full items-center justify-between border-b border-slate-100 p-5 transition-all active:scale-[0.99] dark:border-white/5"
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

            <button
              onClick={() => setIsStopCalibrationOpen(true)}
              className="flex w-full items-center justify-between border-b border-slate-100 p-5 transition-all active:scale-[0.99] dark:border-white/5"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary">
                  <span className="material-icons">near_me</span>
                </div>
                <div className="text-left">
                  <p className="font-bold dark:text-white">Calibrate Stops</p>
                  <p className="text-xs text-slate-500">
                    Save this route stop from the phone&apos;s current GPS
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">{calibratedStopCount} learned</p>
                <span className="material-icons text-slate-400">chevron_right</span>
              </div>
            </button>

            <button
              onClick={() => setIsStopReminderOpen(true)}
              className="flex w-full items-center justify-between p-5 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary">
                  <span className="material-icons">notifications_active</span>
                </div>
                <div className="text-left">
                  <p className="font-bold dark:text-white">Drop-Off Alerts</p>
                  <p className="text-xs text-slate-500">
                    Queue stops, passenger counts, and GPS reminders
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                  {routeReminderCount} queued
                </p>
                <span className="material-icons text-slate-400">chevron_right</span>
              </div>
            </button>
            </div>
          </details>
        </section>

        <section className="space-y-3">
          <details className="group rounded-[1.75rem] bg-white shadow-md dark:bg-night-charcoal">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <HelpHint
                    label="This section is for learning better stop locations, syncing stop data, and checking reminder status. It is separate from passenger fare entry."
                triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
                  >
                    Stops And GPS
                  </HelpHint>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-300">Keep GPS learning and sync controls tucked away until needed.</p>
              </div>
              <span className="material-icons text-slate-400 transition-transform group-open:rotate-180">expand_more</span>
            </summary>
            <div className="border-t border-slate-100 p-5 dark:border-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold dark:text-white">Shared Stop Data</p>
                <p className="mt-1 text-xs text-slate-500">
                  Conductors can save better stop points from the phone&apos;s GPS. Verified stops are computed from submitted samples so the route keeps improving over time.
                </p>
              </div>
              <span className={`rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-widest ${
                stopSyncState.enabled
                  ? 'bg-primary/10 text-primary'
                  : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
              }`}>
                {stopSyncState.enabled ? 'Sync Ready' : 'Local Only'}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center dark:bg-black/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Learned Stops</p>
                <p className="mt-2 text-xl font-black text-slate-800 dark:text-white">{calibratedStopCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center dark:bg-black/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Verified Stops</p>
                <p className="mt-2 text-xl font-black text-slate-800 dark:text-white">{verifiedStopCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center dark:bg-black/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pending Sync</p>
                <p className="mt-2 text-xl font-black text-slate-800 dark:text-white">{stopSyncState.pendingCount}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-black/30">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Reminder Engine</p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-300">
                {reminderSettings.enabled
                  ? `Alerts are ON with ${routeReminderCount} queued stop reminders on this route.`
                  : 'Alerts are OFF right now. Turn them on in Drop-Off Alerts when needed.'}
              </p>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setIsStopCalibrationOpen(true)}
                className="flex-1 rounded-2xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-[0.98]"
              >
                Open Calibration
              </button>
              <button
                onClick={() => void syncStopSubmissions()}
                disabled={!stopSyncState.enabled || !isOnline || stopSyncState.isSyncing}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all active:scale-[0.98] disabled:opacity-50 dark:border-white/10 dark:text-slate-300"
              >
                {stopSyncState.isSyncing ? 'Syncing...' : 'Sync Stop Data'}
              </button>
            </div>

            {stopSyncState.lastError && (
              <p className="mt-3 text-xs font-semibold text-red-500">{stopSyncState.lastError}</p>
            )}
            </div>
          </details>
        </section>

        <section className="space-y-3">
          <details className="group rounded-[1.75rem] bg-white shadow-md dark:bg-night-charcoal">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <HelpHint
                    label="Use this to open the official PWD verification website. The app cannot verify the result automatically because the official page must be checked directly."
                triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
                  >
                    ID Check
                  </HelpHint>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-300">Open official verification tools only when needed.</p>
              </div>
              <span className="material-icons text-slate-400 transition-transform group-open:rotate-180">expand_more</span>
            </summary>
            <div className="border-t border-slate-100 p-5 dark:border-white/5">
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
          </details>
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Preferences</h2>
          <div className="rounded-2xl bg-white shadow-md dark:bg-night-charcoal">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-white/5">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary">
                  <span className="material-icons">dark_mode</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <HelpHint
                      label="Turns on the dark theme for easier use at night or inside dim buses."
                triggerClassName="inline-flex cursor-pointer rounded-md font-bold text-slate-900 dark:text-white"
                    >
                      Night Shift
                    </HelpHint>
                  </div>
                  <p className="text-xs text-slate-500">Dark background mode</p>
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={settings.isNightMode} onChange={toggleNightMode} className="peer sr-only" />
                <div className="h-6 w-11 rounded-full bg-slate-200 transition-all after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full dark:bg-slate-700" />
              </label>
            </div>

            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary">
                  <span className="material-icons">mic</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <HelpHint
                      label="Shows the movable floating microphone for voice fare lookup, voice calculator, stop picking, and tally navigation. Turn this off if it gets in the way."
                triggerClassName="inline-flex cursor-pointer rounded-md font-bold text-slate-900 dark:text-white"
                    >
                      Voice Assistant Bubble
                    </HelpHint>
                  </div>
                  <p className="text-xs text-slate-500">Show or hide the floating microphone</p>
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" checked={settings.floatingVoiceEnabled} onChange={toggleFloatingVoice} className="peer sr-only" />
                <div className="h-6 w-11 rounded-full bg-slate-200 transition-all after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full dark:bg-slate-700" />
              </label>
            </div>
          </div>
        </section>

      </div>

      <footer className="px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1">
        <button
          onClick={() => setIsSupportOpen(true)}
          className="mx-auto flex items-center justify-center gap-2 text-center text-[11px] font-semibold text-slate-400 transition-all active:scale-[0.99] dark:text-slate-500"
        >
          <span>Developed by Zia Louise Mariano</span>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current text-[#1877F2]" aria-hidden="true">
            <path d="M22 12.07C22 6.5 17.52 2 12 2S2 6.5 2 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47H15.2c-1.24 0-1.63.78-1.63 1.58v1.89h2.77l-.44 2.9h-2.33V22c4.78-.75 8.43-4.91 8.43-9.93z"/>
          </svg>
        </button>
      </footer>

      <NormalCalcOverlay isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
      <StopCalibrationOverlay isOpen={isStopCalibrationOpen} onClose={() => setIsStopCalibrationOpen(false)} />
      <StopReminderOverlay isOpen={isStopReminderOpen} onClose={() => setIsStopReminderOpen(false)} />
      <SupportContactSheet isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </div>
  );
};

export default SetupScreen;
