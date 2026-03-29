import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

interface Props {
  onExit?: () => void;
}

const peso = '\u20B1';
const formatDistance = (distance: number) =>
  Number.isInteger(distance) ? `${distance} km` : `${distance.toFixed(1)} km`;

const LogsScreen: React.FC<Props> = ({ onExit }) => {
  const { settings, history, toggleFavorite, deleteHistory, activeRoute, currentShift } = useApp();
  const [tab, setTab] = useState<'all' | 'route' | 'shift' | 'fav'>('route');

  const allHistory = useMemo(() => history, [history]);
  const routeHistory = useMemo(
    () => history.filter(record => record.routeId === activeRoute.id),
    [activeRoute.id, history]
  );
  const currentRouteShift = currentShift?.routeId === activeRoute.id ? currentShift : null;
  const shiftHistory = useMemo(
    () => currentRouteShift
      ? routeHistory.filter(record => record.shiftId === currentRouteShift.id)
      : [],
    [currentRouteShift, routeHistory]
  );
  const favoriteHistory = useMemo(
    () => history.filter(record => record.isFavorite),
    [history]
  );
  const filtered = tab === 'all'
    ? allHistory
    : tab === 'shift'
      ? shiftHistory
      : tab === 'fav'
        ? favoriteHistory
        : routeHistory;
  const tabCards = [
    { id: 'all' as const, label: 'All Logs', icon: 'history', count: allHistory.length },
    { id: 'route' as const, label: 'Route Logs', icon: 'alt_route', count: routeHistory.length },
    { id: 'shift' as const, label: 'Shift Logs', icon: 'badge', count: shiftHistory.length },
    { id: 'fav' as const, label: 'Favorites', icon: 'star', count: favoriteHistory.length }
  ];
  const isCM = settings.conductorMode;

  return (
    <div className="flex min-h-full flex-col animate-fade-in bg-[#f8f6f6] transition-all dark:bg-black">
      <header className="sticky top-0 z-40 flex shrink-0 items-center justify-between bg-primary px-6 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <span className="material-icons text-2xl text-white">history</span>
          <div>
            <h1 className="text-xl font-medium tracking-tight text-white">History Logs</h1>
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

      <div className="sticky top-[76px] z-10 space-y-3 border-b bg-[#f8f6f6]/80 px-4 pb-4 pt-4 backdrop-blur-lg dark:border-white/10 dark:bg-black/80">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            Tap a log group below to filter the records.
          </p>
          <button
            onClick={deleteHistory}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-primary shadow-sm transition-transform active:scale-90"
          >
            <span className="material-icons">delete_outline</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tabCards.map(card => {
            const isActive = tab === card.id;
            return (
              <button
                key={card.id}
                onClick={() => setTab(card.id)}
                className={`rounded-2xl border px-3 py-3 text-center shadow-sm transition-all active:scale-[0.98] ${
                  isActive
                    ? 'border-primary/20 bg-white ring-2 ring-primary/10 dark:border-primary/30 dark:bg-night-charcoal'
                    : 'border-transparent bg-white dark:bg-night-charcoal'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500">
                  <span className={`material-icons text-sm ${isActive ? 'text-primary' : ''}`}>{card.icon}</span>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'text-primary' : ''}`}>
                    {card.label}
                  </p>
                </div>
                <p className={`mt-2 text-lg font-black ${isActive ? 'text-primary' : 'text-slate-800 dark:text-white'}`}>
                  {card.count}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <main className={`p-4 pb-8 transition-all ${isCM ? 'space-y-5' : 'space-y-4'}`}>
        {tab === 'shift' && !currentRouteShift && (
          <div className="rounded-2xl bg-white px-4 py-5 text-sm font-semibold text-slate-500 shadow-sm dark:bg-night-charcoal dark:text-slate-300">
            No open shift on this route yet. Start a shift in Settings to keep logs grouped per trip.
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-14 text-center opacity-30 dark:text-white">
            <span className="material-icons text-6xl">receipt_long</span>
            <p className="mt-4 font-bold">No records found</p>
          </div>
        ) : (
          filtered.map(record => {
            const punchedFareType = record.punchedFareType ?? 'regular';
            const isDiscountedPunch =
              record.type !== 'tally' &&
              punchedFareType === 'discounted' &&
              record.discountedFare > 0;
            const primaryFare = isDiscountedPunch ? record.discountedFare : record.regularFare;
            const secondaryLabel = isDiscountedPunch ? 'Regular' : 'Disc';
            const secondaryFare = isDiscountedPunch ? record.regularFare : record.discountedFare;

            return (
              <div
                key={record.id}
                className={`relative overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all dark:bg-night-charcoal ${isCM ? 'p-10' : 'p-5'} ${record.type === 'tally' ? 'border-primary/20' : 'border-slate-100 dark:border-white/5'}`}
              >
                {record.type === 'tally' && (
                  <div className="absolute right-0 top-0 rounded-bl-xl bg-primary px-3 py-1 text-[8px] font-black uppercase text-white">
                    Waybill Entry
                  </div>
                )}

                <div className="mb-4 flex items-start justify-between">
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded bg-slate-100 px-2 py-1 font-black dark:bg-white/10 dark:text-slate-300 ${isCM ? 'text-[12px]' : 'text-[10px]'}`}>
                      {new Date(record.timestamp).toLocaleDateString()} {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {record.routeLabel && (
                      <span className={`rounded bg-primary/10 px-2 py-1 font-black text-primary ${isCM ? 'text-[12px]' : 'text-[10px]'}`}>
                        {record.routeLabel}
                      </span>
                    )}
                    {record.shiftId && (
                      <span className={`rounded bg-emerald-50 px-2 py-1 font-black text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300 ${isCM ? 'text-[12px]' : 'text-[10px]'}`}>
                        Shift Saved
                      </span>
                    )}
                    {record.type !== 'tally' && (
                      <span
                        className={`rounded px-2 py-1 font-black ${isCM ? 'text-[12px]' : 'text-[10px]'} ${isDiscountedPunch ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-primary/10 text-primary'}`}
                      >
                        {isDiscountedPunch ? 'Discounted Punched' : 'Regular Punched'}
                      </span>
                    )}
                  </div>
                  <button onClick={() => toggleFavorite(record.id)}>
                    <span className={`material-icons ${isCM ? 'text-3xl' : 'text-2xl'} ${record.isFavorite ? 'text-primary' : 'text-slate-200 dark:text-white/10'}`}>
                      star
                    </span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className={`font-900 leading-tight transition-all dark:text-white ${isCM ? 'text-3xl' : 'text-lg'} ${record.type === 'tally' ? 'text-primary' : ''}`}>
                      {record.origin}
                    </h3>
                    <div className="my-2 flex items-center gap-2">
                      <span className="material-icons rotate-90 text-sm text-primary">arrow_right_alt</span>
                      <span className={`font-black text-slate-400 ${isCM ? 'text-[12px]' : 'text-[10px]'}`}>
                        {record.type === 'tally' ? 'Final Audit' : formatDistance(record.distance)}
                      </span>
                    </div>
                    <h3 className={`font-900 leading-tight transition-all dark:text-white ${isCM ? 'text-3xl' : 'text-lg'}`}>
                      {record.destination}
                    </h3>
                  </div>

                  <div className="text-right">
                    <p className={`font-900 text-primary transition-all ${isCM ? 'text-5xl' : 'text-3xl'}`}>{peso}{primaryFare}</p>
                    {record.type !== 'tally' && secondaryFare > 0 && (
                      <p className={`mt-1 font-black uppercase text-slate-400 transition-all ${isCM ? 'text-[12px]' : 'text-[9px]'}`}>
                        {secondaryLabel}: {peso}{secondaryFare}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
};

export default LogsScreen;
