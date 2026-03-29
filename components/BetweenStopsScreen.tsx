import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import StopPickerOverlay from './StopPickerOverlay';
import ManualKMOverlay from './ManualKMOverlay';
import { calculateFare } from '../utils/fare';

interface Props {
  onExit?: () => void;
}

const peso = '\u20B1';

const BetweenStopsScreen: React.FC<Props> = ({ onExit }) => {
  const { activeRoute, settings, origin, destination, setOrigin, setDestination, showToast } = useApp();
  const [precision, setPrecision] = useState(50);
  const [isOriginPickerOpen, setIsOriginPickerOpen] = useState(false);
  const [isDestPickerOpen, setIsDestPickerOpen] = useState(false);
  const [isManualKmOpen, setIsManualKmOpen] = useState(false);

  const originStop = activeRoute.stops.find(s => s.name === origin) || activeRoute.stops[0];
  const destStop = activeRoute.stops.find(s => s.name === destination) || activeRoute.stops[activeRoute.stops.length - 1];

  const estimatedKM = useMemo(() => {
    const range = destStop.km - originStop.km;
    return originStop.km + (range * (precision / 100));
  }, [destStop.km, originStop.km, precision]);

  const nearestStop = useMemo(() => {
    return activeRoute.stops.reduce((prev, curr) => {
      return Math.abs(curr.km - estimatedKM) < Math.abs(prev.km - estimatedKM) ? curr : prev;
    });
  }, [activeRoute.stops, estimatedKM]);

  const sortedStops = useMemo(
    () => [...activeRoute.stops].sort((left, right) => left.km - right.km),
    [activeRoute.stops]
  );

  const surroundingStops = useMemo(() => {
    let beforeStop = sortedStops[0];
    let afterStop = sortedStops[sortedStops.length - 1];

    for (const stop of sortedStops) {
      if (stop.km <= estimatedKM) {
        beforeStop = stop;
      }
      if (stop.km >= estimatedKM) {
        afterStop = stop;
        break;
      }
    }

    return { beforeStop, afterStop };
  }, [estimatedKM, sortedStops]);

  const totalDist = Math.abs(estimatedKM - originStop.km);
  const remainingDist = Math.abs(destStop.km - estimatedKM);
  const fares = useMemo(() => calculateFare(totalDist, activeRoute.fare), [activeRoute.fare, totalDist]);
  const isExactTariffStop = surroundingStops.beforeStop.km === surroundingStops.afterStop.km;

  const handleSwap = (e: React.MouseEvent) => {
    e.stopPropagation();
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    showToast('Route reversed');
  };

  const isCM = settings.conductorMode;

  return (
    <div className="flex flex-col min-h-full animate-fade-in bg-[#f8f6f6] transition-all dark:bg-black">
      <header className="sticky top-0 z-40 h-[72px] shrink-0 bg-primary px-6 py-4 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-icons text-2xl text-white">map</span>
          <h1 className="text-xl font-medium tracking-tight text-white">Mid-Stop Est.</h1>
        </div>
        <button
          onClick={onExit}
          className="flex items-center justify-center rounded-xl bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
        >
          <span className="material-icons text-lg leading-none">close</span>
        </button>
      </header>

      <div className={`flex flex-col gap-5 p-5 pb-10 transition-all ${isCM ? '' : ''}`}>
        <div className="relative flex flex-col">
          <button
            onClick={() => setIsOriginPickerOpen(true)}
            className={`mb-1 flex items-center justify-between rounded-b-lg rounded-t-2xl border border-slate-200 bg-white text-left shadow-sm transition-all active:bg-slate-50 dark:border-white/10 dark:bg-night-charcoal ${isCM ? 'p-6' : 'p-4'}`}
          >
            <div>
              <p className="mb-1 text-[10px] font-black uppercase text-primary">From</p>
              <h2 className={`${isCM ? 'text-2xl' : 'text-xl'} max-w-[200px] truncate font-900 dark:text-white`}>{origin}</h2>
            </div>
            <span className="material-icons text-slate-300">expand_more</span>
          </button>

          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <button
              onClick={handleSwap}
              aria-label="Swap route direction"
              className={`flex items-center justify-center rounded-xl border-4 border-[#f8f6f6] bg-primary text-white shadow-xl transition-all hover:bg-red-600 active:scale-90 dark:border-black ${isCM ? 'h-14 w-14' : 'h-11 w-11'}`}
            >
              <span className={`material-icons ${isCM ? 'text-2xl' : 'text-xl'}`}>swap_vert</span>
            </button>
          </div>

          <button
            onClick={() => setIsDestPickerOpen(true)}
            className={`flex items-center justify-between rounded-b-2xl rounded-t-lg border border-slate-200 bg-white text-left shadow-sm transition-all active:bg-slate-50 dark:border-white/10 dark:bg-night-charcoal ${isCM ? 'p-6' : 'p-4'}`}
          >
            <div>
              <p className="mb-1 text-[10px] font-black uppercase text-primary">To</p>
              <h2 className={`${isCM ? 'text-2xl' : 'text-xl'} max-w-[200px] truncate font-900 dark:text-white`}>{destination}</h2>
            </div>
            <span className="material-icons text-slate-300">expand_more</span>
          </button>
        </div>

        <div className={`rounded-[2.5rem] border border-primary/10 bg-white shadow-sm transition-all dark:bg-night-charcoal ${isCM ? 'p-8' : 'p-6'}`}>
          <div className="mb-6 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Adjust Proximity</span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase italic text-primary">
              {precision === 50 ? 'Midpoint' : `${precision}% Route`}
            </span>
          </div>
          <div className="py-4">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={precision}
              onChange={(e) => setPrecision(parseInt(e.target.value, 10))}
              className="h-4 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-primary dark:bg-white/10"
            />
            <div className="mt-5 flex justify-between text-[10px] font-black uppercase tracking-tighter text-slate-400">
              <div className="flex max-w-[100px] flex-col">
                <span className="truncate">{origin}</span>
                <span className="text-[8px] opacity-40">0%</span>
              </div>
              <div className="flex flex-col items-center rounded-full bg-primary px-3 py-1.5 text-white">
                <span className="leading-none">{precision}%</span>
              </div>
              <div className="flex max-w-[100px] flex-col items-end text-right">
                <span className="truncate">{destination}</span>
                <span className="text-[8px] opacity-40">100%</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`relative overflow-hidden rounded-[3rem] border-t-8 border-primary bg-white shadow-2xl transition-all dark:border-white/10 dark:bg-night-charcoal ${isCM ? 'p-8' : 'p-8'}`}>
          <div className="pointer-events-none absolute right-0 top-0 p-4 opacity-5">
            <span className="material-icons text-9xl">explore</span>
          </div>

          <div className="mb-6 text-center">
            <span className="rounded-full border border-white/10 bg-zinc-900 px-5 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-white dark:bg-black">
              Est. Computation
            </span>
          </div>

          <div className="mb-6 flex flex-col border-b pb-6 text-center dark:border-white/10">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Nearest Landmark</p>
              <h3 className={`${isCM ? 'text-3xl' : 'text-2xl'} mb-1 font-black uppercase leading-tight text-primary`}>
                {nearestStop.name}
              </h3>
              <div className="flex items-baseline justify-center gap-2">
                <span className={`${isCM ? 'text-5xl' : 'text-4xl'} font-900 leading-none tracking-tighter dark:text-white`}>
                  KM {Math.round(estimatedKM)}
                </span>
                <span className="text-xs font-black text-slate-400">({estimatedKM.toFixed(1)})</span>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-100 bg-slate-50/80 px-4 py-4 text-left shadow-sm dark:border-white/10 dark:bg-black/20">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Between KM Posts</p>
              {isExactTariffStop ? (
                <>
                  <p className="text-base font-black uppercase text-slate-900 dark:text-white">
                    Exact stop at {surroundingStops.beforeStop.name}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-white/60">
                    KM {surroundingStops.beforeStop.km}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-black uppercase text-slate-900 dark:text-white">
                    {surroundingStops.beforeStop.name} to {surroundingStops.afterStop.name}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-white/60">
                    KM {surroundingStops.beforeStop.km} to KM {surroundingStops.afterStop.km}
                  </p>
                </>
              )}
            </div>

            <div className="rounded-3xl border border-slate-100 bg-slate-50/80 px-4 py-4 text-left shadow-sm dark:border-white/10 dark:bg-black/20">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Trip Progress</p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">From Pickup</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{totalDist.toFixed(1)} KM</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-slate-400">To Destination</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{remainingDist.toFixed(1)} KM</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3">
            <div className="flex flex-col justify-center rounded-3xl border border-slate-100 bg-white px-2 py-4 text-center shadow-sm">
              <p className="mb-2 text-[9px] font-black uppercase text-slate-400">Regular</p>
              <div className="flex items-center justify-center">
                <span className={`${isCM ? 'text-lg' : 'text-sm'} mr-1 font-800 text-primary`}>{peso}</span>
                <p className={`${isCM ? 'text-3xl' : 'text-2xl'} font-900 leading-none tracking-tighter text-primary`}>
                  {fares.reg}
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-center rounded-3xl border border-white/5 bg-[#1a1a1a] px-2 py-4 text-center shadow-lg">
              <p className="mb-2 text-[9px] font-black uppercase text-[#fbbf24]">Discounted</p>
              <div className="flex items-center justify-center">
                <span className={`${isCM ? 'text-lg' : 'text-sm'} mr-1 font-800 text-[#22c55e]`}>{peso}</span>
                <p className={`${isCM ? 'text-3xl' : 'text-2xl'} font-900 leading-none tracking-tighter text-[#22c55e]`}>
                  {fares.disc}
                </p>
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${isCM ? 'gap-4' : 'gap-3'}`}>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-left shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                {isExactTariffStop ? 'Exact tariff stop detected' : 'Manual KM recommended'}
              </p>
              <p className="text-sm font-semibold leading-relaxed text-amber-900 dark:text-amber-100">
                {isExactTariffStop
                  ? `This estimate lands on ${surroundingStops.beforeStop.name}. You can still open Manual KM if you want to fine-tune the pickup or destination.`
                  : `This estimate sits between ${surroundingStops.beforeStop.name} and ${surroundingStops.afterStop.name}. Manual KM is safer for an accurate fare in between-stop pickups.`}
              </p>
            </div>
            <button
              onClick={() => setIsManualKmOpen(true)}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 text-[11px] font-black uppercase tracking-widest text-white transition-transform active:scale-95 dark:bg-black ${isCM ? 'py-6' : 'py-4'}`}
            >
              <span className="material-icons text-sm">straighten</span>
              Use Manual KM
            </button>
          </div>
        </div>
      </div>

      {isOriginPickerOpen && (
        <StopPickerOverlay
          isOpen={isOriginPickerOpen}
          onClose={() => setIsOriginPickerOpen(false)}
          onSelect={(name) => {
            setOrigin(name);
            setIsOriginPickerOpen(false);
          }}
          title="From"
        />
      )}
      {isDestPickerOpen && (
        <StopPickerOverlay
          isOpen={isDestPickerOpen}
          onClose={() => setIsDestPickerOpen(false)}
          onSelect={(name) => {
            setDestination(name);
            setIsDestPickerOpen(false);
          }}
          title="To"
        />
      )}
      <ManualKMOverlay
        isOpen={isManualKmOpen}
        onClose={() => setIsManualKmOpen(false)}
        initialPickupKm={originStop.km}
        initialDestKm={Number(estimatedKM.toFixed(1))}
      />
    </div>
  );
};

export default BetweenStopsScreen;
