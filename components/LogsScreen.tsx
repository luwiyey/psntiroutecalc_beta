import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

interface Props {
  onExit?: () => void;
}

const formatDistance = (distance: number) =>
  Number.isInteger(distance) ? `${distance} km` : `${distance.toFixed(1)} km`;

const LogsScreen: React.FC<Props> = ({ onExit }) => {
  const { settings, history, toggleFavorite, deleteHistory, activeRoute } = useApp();
  const [tab, setTab] = useState<'all' | 'fav'>('all');

  const filtered = tab === 'all' ? history : history.filter(record => record.isFavorite);
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

      <div className="sticky top-[76px] z-10 flex items-center gap-3 border-b bg-[#f8f6f6]/80 px-4 pb-4 pt-4 backdrop-blur-lg dark:border-white/10 dark:bg-black/80">
        <div className="flex flex-1 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
          <button
            onClick={() => setTab('all')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${tab === 'all' ? 'bg-white shadow-sm dark:bg-night-charcoal dark:text-white' : 'opacity-50 dark:text-slate-400'}`}
          >
            <span className="material-icons text-sm">history</span>
            HISTORY
          </button>
          <button
            onClick={() => setTab('fav')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${tab === 'fav' ? 'bg-white shadow-sm dark:bg-night-charcoal dark:text-white' : 'opacity-50 dark:text-slate-400'}`}
          >
            <span className="material-icons text-sm">star</span>
            FAVORITES
          </button>
        </div>
        <button
          onClick={deleteHistory}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-primary shadow-sm transition-transform active:scale-90"
        >
          <span className="material-icons">delete_outline</span>
        </button>
      </div>

      <main className={`p-4 pb-8 transition-all ${isCM ? 'space-y-5' : 'space-y-4'}`}>
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
                    <p className={`font-900 text-primary transition-all ${isCM ? 'text-5xl' : 'text-3xl'}`}>₱{primaryFare}</p>
                    {record.type !== 'tally' && secondaryFare > 0 && (
                      <p className={`mt-1 font-black uppercase text-slate-400 transition-all ${isCM ? 'text-[12px]' : 'text-[9px]'}`}>
                        {secondaryLabel}: ₱{secondaryFare}
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
