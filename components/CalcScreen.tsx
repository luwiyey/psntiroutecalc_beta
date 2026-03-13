import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  DISCOUNT_RATE_MULTIPLIER,
  MIN_DISCOUNT_FARE,
  MIN_REGULAR_FARE,
  PREVIOUS_MIN_REGULAR_FARE,
  PREVIOUS_ORDINARY_FARE_PER_KM,
  STOPS
} from '../constants';
import StopPickerOverlay from './StopPickerOverlay';
import ManualKMOverlay from './ManualKMOverlay';
import ConductorCalcOverlay from './ConductorCalcOverlay';
import { calculateFare, formatFareRate } from '../utils/fare';

const CalcScreen: React.FC = () => {
  const { settings, origin, destination, setOrigin, setDestination, addRecord, setActiveFare, showToast } = useApp();
  const [isOriginPickerOpen, setIsOriginPickerOpen] = useState(false);
  const [isDestPickerOpen, setIsDestPickerOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isConductorCalcOpen, setIsConductorCalcOpen] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const originStop = STOPS.find(s => s.name === origin) || STOPS[0];
  const destStop = STOPS.find(s => s.name === destination) || STOPS[STOPS.length - 1];

  const distance = useMemo(() => Math.abs(destStop.km - originStop.km), [originStop, destStop]);
  const direction = useMemo(() => {
    if (originStop.km === destStop.km) return null;
    return destStop.km > originStop.km ? 'Northbound (Toward Baguio)' : 'Southbound (Toward Bayambang)';
  }, [originStop, destStop]);

  const calculation = useMemo(
    () => calculateFare(distance, settings),
    [distance, settings.discountRate, settings.regularRate]
  );

  useEffect(() => {
    setActiveFare(calculation.reg);
  }, [calculation.reg, setActiveFare]);

  const regularIncreasePerKm = useMemo(
    () => (settings.regularRate - PREVIOUS_ORDINARY_FARE_PER_KM).toFixed(2),
    [settings.regularRate]
  );
  const previousDiscountRate = PREVIOUS_ORDINARY_FARE_PER_KM * DISCOUNT_RATE_MULTIPLIER;
  const discountedIncreasePerKm = useMemo(
    () => (settings.discountRate - previousDiscountRate).toFixed(2),
    [previousDiscountRate, settings.discountRate]
  );
  const previousDiscountMinimum = PREVIOUS_MIN_REGULAR_FARE * DISCOUNT_RATE_MULTIPLIER;
  const minimumIncrease = useMemo(
    () => MIN_REGULAR_FARE - PREVIOUS_MIN_REGULAR_FARE,
    []
  );
  const discountedMinimumIncrease = useMemo(
    () => MIN_DISCOUNT_FARE - previousDiscountMinimum,
    [previousDiscountMinimum]
  );

  const formatKM = (km: number) => {
    return km % 1 === 0 ? km.toFixed(0) : km.toFixed(1);
  };

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const handleSave = () => {
    if (distance === 0) return;
    addRecord({
      origin,
      destination,
      distance,
      regularFare: calculation.reg,
      discountedFare: calculation.disc,
      isFavorite: false
    });
    showToast('Fare saved to logs');
  };

  const handleFavorite = () => {
    if (distance === 0) return;
    addRecord({
      origin,
      destination,
      distance,
      regularFare: calculation.reg,
      discountedFare: calculation.disc,
      isFavorite: true
    });
    showToast('Saved to Favorites');
  };

  const handleReset = () => {
    setOrigin(STOPS[0].name);
    setDestination(STOPS[STOPS.length - 1].name);
    showToast('Reset to default route');
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in pb-24 bg-[#f8f6f6] dark:bg-black">
      {/* Sticky Header with ₱ Change Button */}
      <header className="bg-primary text-white px-6 py-4 flex items-center justify-between shadow-lg sticky top-0 z-40 h-[72px]">
        <div className="flex items-center gap-3">
          <span className="material-icons text-2xl">calculate</span>
          <h1 className="text-xl font-medium tracking-tight">Fare Calculator</h1>
        </div>
        <button 
          onClick={() => setIsConductorCalcOpen(true)}
          className="bg-white text-primary px-4 py-2 rounded-xl flex items-center gap-2 shadow-md active:scale-95 transition-all"
        >
          <span className="text-lg font-black leading-none">₱</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Change</span>
        </button>
      </header>

      {/* Route Pill Chip - CLICKABLE to Reverse */}
      <div className="flex flex-col items-center mt-6 mb-4 gap-2">
        <button 
          onClick={handleSwap}
          className="bg-[#eff6ff] dark:bg-white/5 px-8 py-2 rounded-full border border-[#dbeafe] dark:border-white/10 shadow-sm active:scale-95 transition-all"
        >
          <p className="text-[11px] font-900 text-[#1e40af] dark:text-blue-300 uppercase tracking-[0.2em] flex items-center gap-2">
            {origin} <span className="material-icons text-[10px]">swap_horiz</span> {destination}
          </p>
        </button>
        {direction ? (
          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <span className="material-icons text-[10px]">explore</span>
            {direction}
          </span>
        ) : (
          <span className="text-[9px] font-black text-primary uppercase tracking-widest flex items-center gap-1">
            <span className="material-icons text-[10px]">warning</span>
            SAME STOP SELECTED
          </span>
        )}
      </div>

      {/* Pickup & Destination Cards */}
      <div className="px-5 space-y-2 relative mb-8">
        <button 
          onClick={() => setIsOriginPickerOpen(true)}
          className="w-full bg-white dark:bg-night-charcoal rounded-[2rem] p-8 border border-slate-100 dark:border-white/10 text-left flex justify-between items-center shadow-sm active:bg-slate-50 transition-colors"
        >
          <div>
            <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">Pickup Point</p>
            <h2 className="text-3xl font-800 text-slate-800 dark:text-white leading-tight">KM {formatKM(originStop.km)} – {origin}</h2>
          </div>
          <span className="material-icons text-slate-300">chevron_right</span>
        </button>

        {/* Floating Centered Swap Button */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <button 
            onClick={handleSwap}
            className="w-14 h-14 bg-primary text-white rounded-2xl shadow-xl border-[6px] border-[#f8f6f6] dark:border-black active:scale-90 transition-transform flex items-center justify-center pointer-events-auto"
          >
            <span className="material-icons text-2xl">swap_vert</span>
          </button>
        </div>

        <button 
          onClick={() => setIsDestPickerOpen(true)}
          className="w-full bg-white dark:bg-night-charcoal rounded-[2rem] p-8 border border-slate-100 dark:border-white/10 text-left flex justify-between items-center shadow-sm active:bg-slate-50 transition-colors"
        >
          <div>
            <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">Destination</p>
            <h2 className="text-3xl font-800 text-slate-800 dark:text-white leading-tight">KM {formatKM(destStop.km)} – {destination}</h2>
          </div>
          <span className="material-icons text-slate-300">chevron_right</span>
        </button>
      </div>

      {/* Result Card: Large Yellow Box */}
      <div className="px-5 mb-8">
        <div className="bg-[#fbbf24] dark:bg-night-charcoal rounded-[2.5rem] p-8 shadow-2xl border-b-8 border-black/10 relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-black text-slate-700 dark:text-slate-400 uppercase tracking-widest mb-1">Total Distance</p>
              <p className="text-6xl font-900 text-zinc-900 dark:text-white leading-none tracking-tighter">
                {formatKM(distance)} <span className="text-3xl font-800">km</span>
              </p>
            </div>
            {calculation.isMinApplied && distance > 0 && (
               <span className="bg-red-600 text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter shadow-md">MINIMUM FARE APPLIED</span>
            )}
          </div>

          <div className="h-0.5 bg-black/10 dark:bg-white/10 w-full mb-6"></div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-black p-5 rounded-3xl shadow-sm text-center border border-white/20">
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase mb-2">Regular</p>
              <p className="text-5xl font-900 text-primary dark:text-vibrant-yellow leading-none tracking-tighter flex items-center justify-center">
                <span className="text-3xl mr-0.5 font-800">₱</span>{calculation.reg}
              </p>
            </div>
            <div className="bg-[#1a1a1a] dark:bg-white/5 p-5 rounded-3xl shadow-lg text-center border border-white/5">
              <p className="text-[10px] font-black text-[#fbbf24] uppercase mb-2">Discounted</p>
              <p className="text-5xl font-900 text-[#22c55e] leading-none tracking-tighter flex items-center justify-center">
                <span className="text-3xl mr-0.5 font-800">₱</span>{calculation.disc}
              </p>
            </div>
          </div>

          {/* Expandable Breakdown Viewer */}
          {distance > 0 && (
            <div className="mt-6 border-t border-black/5 dark:border-white/5 pt-4">
               <button 
                 onClick={() => setShowBreakdown(!showBreakdown)}
                 className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-700 dark:text-slate-400 tracking-widest mb-2"
               >
                 <span className="material-icons text-xs">{showBreakdown ? 'expand_less' : 'expand_more'}</span>
                 {showBreakdown ? 'Hide Breakdown' : 'Show Breakdown'}
               </button>
               {showBreakdown && (
                 <div className="space-y-1 animate-fade-in text-[10px] font-black text-slate-700/80 dark:text-slate-400/80 uppercase">
                    <p>• {formatKM(distance)} km × ₱{formatFareRate(settings.regularRate)} = ₱{calculation.rawReg.toFixed(2)} (Reg)</p>
                    <p>• {formatKM(distance)} km × ₱{formatFareRate(settings.discountRate)} = ₱{calculation.rawDisc.toFixed(2)} (Disc)</p>
                    <p>• Final: Rounded to nearest Peso {calculation.isMinApplied && ' (Min. Applied)'}</p>
                 </div>
               )}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 mb-8">
        <div className="bg-white dark:bg-night-charcoal rounded-[2rem] border border-slate-200 dark:border-white/10 px-5 py-4 shadow-sm">
          <p className="text-[9px] font-black text-primary uppercase tracking-[0.2em] mb-2">Fare Guide</p>
          <p className="text-xs font-black text-slate-700 dark:text-slate-300 leading-relaxed uppercase">
            Minimum: +{minimumIncrease.toFixed(0)} pesos regular / +{discountedMinimumIncrease.toFixed(0)} pesos discounted.
            Beyond minimum: +{regularIncreasePerKm}/km regular, +{discountedIncreasePerKm}/km discounted.
          </p>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="px-5 space-y-4 pb-10">
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={handleSave} 
            disabled={distance === 0} 
            className="flex flex-col items-center justify-center gap-2 bg-white dark:bg-night-charcoal py-8 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 disabled:opacity-30 shadow-sm transition-all"
          >
            <span className="material-icons text-primary text-3xl">save</span>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">Save Log</span>
          </button>
          <button 
            onClick={handleFavorite} 
            disabled={distance === 0} 
            className="flex flex-col items-center justify-center gap-2 bg-white dark:bg-night-charcoal py-8 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 disabled:opacity-30 shadow-sm transition-all"
          >
            <span className="material-icons text-primary text-3xl">star</span>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">Favorite</span>
          </button>
        </div>

        <button 
          onClick={() => setIsManualOpen(true)} 
          className="w-full bg-white dark:bg-night-charcoal py-6 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 shadow-sm transition-all flex items-center justify-center gap-4"
        >
          <span className="material-icons text-primary text-2xl">keyboard</span>
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-700 dark:text-slate-300">Manual Entry</span>
        </button>
        
        <button 
          onClick={handleReset} 
          className="w-full bg-white dark:bg-night-charcoal py-6 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 shadow-sm transition-all flex items-center justify-center gap-4"
        >
          <span className="material-icons text-primary text-2xl">refresh</span>
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-700 dark:text-slate-300">Reset Route</span>
        </button>
      </div>

      <StopPickerOverlay isOpen={isOriginPickerOpen} onClose={() => setIsOriginPickerOpen(false)} onSelect={(name) => { setOrigin(name); setIsOriginPickerOpen(false); }} title="Pickup" />
      <StopPickerOverlay isOpen={isDestPickerOpen} onClose={() => setIsDestPickerOpen(false)} onSelect={(name) => { setDestination(name); setIsDestPickerOpen(false); }} title="Destination" />
      <ManualKMOverlay isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
      <ConductorCalcOverlay isOpen={isConductorCalcOpen} onClose={() => setIsConductorCalcOpen(false)} initialValue={calculation.reg} />
    </div>
  );
};

export default CalcScreen;
