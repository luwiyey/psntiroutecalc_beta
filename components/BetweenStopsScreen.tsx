import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { STOPS, MIN_REGULAR_FARE, MIN_DISCOUNT_FARE } from '../constants';
import StopPickerOverlay from './StopPickerOverlay';

interface Props {
  onExit?: () => void;
}

const BetweenStopsScreen: React.FC<Props> = ({ onExit }) => {
  const { settings, origin, destination, setOrigin, setDestination, addRecord, showToast } = useApp();
  const [precision, setPrecision] = useState(50);
  const [isOriginPickerOpen, setIsOriginPickerOpen] = useState(false);
  const [isDestPickerOpen, setIsDestPickerOpen] = useState(false);

  const originStop = STOPS.find(s => s.name === origin) || STOPS[0];
  const destStop = STOPS.find(s => s.name === destination) || STOPS[STOPS.length - 1];

  const estimatedKM = useMemo(() => {
    const range = destStop.km - originStop.km;
    return originStop.km + (range * (precision / 100));
  }, [originStop, destStop, precision]);

  const nearestStop = useMemo(() => {
    return STOPS.reduce((prev, curr) => {
      return (Math.abs(curr.km - estimatedKM) < Math.abs(prev.km - estimatedKM) ? curr : prev);
    });
  }, [estimatedKM]);

  const totalDist = Math.abs(estimatedKM - originStop.km);
  
  const fares = useMemo(() => {
    if (totalDist === 0) return { reg: 0, disc: 0 };
    let regBase = totalDist * settings.regularRate;
    let discBase = totalDist * settings.discountRate;
    
    const reg = Math.ceil(regBase - 0.5);
    const disc = Math.ceil(discBase - 0.5);
    
    return { 
      reg: Math.max(reg, MIN_REGULAR_FARE), 
      disc: Math.max(disc, MIN_DISCOUNT_FARE) 
    };
  }, [totalDist, settings]);

  const handleSwap = (e: React.MouseEvent) => {
    e.stopPropagation();
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    showToast('Route reversed');
  };

  const handleAddToTally = (fare: number, typeLabel: string) => {
    addRecord({
      origin: `Est: ${origin}`,
      destination: `Near ${nearestStop.name} (${precision}%)`,
      distance: totalDist,
      regularFare: fare,
      discountedFare: 0,
      isFavorite: false,
      type: 'tally'
    });
    showToast(`${typeLabel} fare logged`);
  };

  const isCM = settings.conductorMode;

  return (
    <div className="flex flex-col min-h-full animate-fade-in bg-[#f8f6f6] dark:bg-black transition-all">
      {/* Header */}
      <header className="shrink-0 bg-primary flex items-center justify-between px-6 py-4 shadow-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="material-icons text-white text-2xl">map</span>
          <h1 className="text-xl font-medium text-white tracking-tight">Mid-Stop Est.</h1>
        </div>
        <button 
          onClick={onExit}
          className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-xl transition-colors flex items-center justify-center"
        >
          <span className="material-icons text-lg leading-none">close</span>
        </button>
      </header>

      <div className={`p-5 flex flex-col transition-all pb-28 ${isCM ? 'gap-6' : 'gap-6'}`}>
        {/* Unified Input Group */}
        <div className="flex flex-col relative">
          <button 
            onClick={() => setIsOriginPickerOpen(true)}
            className={`bg-white dark:bg-night-charcoal rounded-t-2xl rounded-b-lg border border-slate-200 dark:border-white/10 text-left flex justify-between items-center active:bg-slate-50 transition-all shadow-sm mb-1 ${isCM ? 'p-6' : 'p-4'}`}
          >
            <div>
              <p className="text-[10px] uppercase font-black text-primary mb-1">From</p>
              <h2 className={`${isCM ? 'text-2xl' : 'text-xl'} font-900 dark:text-white truncate max-w-[200px]`}>{origin}</h2>
            </div>
            <span className="material-icons text-slate-300">expand_more</span>
          </button>

          {/* Centered Swap Button */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <button 
              onClick={handleSwap}
              className={`bg-primary text-white rounded-xl shadow-xl border-4 border-[#f8f6f6] dark:border-black flex items-center justify-center active:scale-90 transition-all hover:bg-red-600 ${isCM ? 'w-14 h-14' : 'w-11 h-11'}`}
              aria-label="Swap route direction"
            >
              <span className={`material-icons ${isCM ? 'text-2xl' : 'text-xl'}`}>swap_vert</span>
            </button>
          </div>

          <button 
            onClick={() => setIsDestPickerOpen(true)}
            className={`bg-white dark:bg-night-charcoal rounded-b-2xl rounded-t-lg border border-slate-200 dark:border-white/10 text-left flex justify-between items-center active:bg-slate-50 transition-all shadow-sm ${isCM ? 'p-6' : 'p-4'}`}
          >
            <div>
              <p className="text-[10px] uppercase font-black text-primary mb-1">To</p>
              <h2 className={`${isCM ? 'text-2xl' : 'text-xl'} font-900 dark:text-white truncate max-w-[200px]`}>{destination}</h2>
            </div>
            <span className="material-icons text-slate-300">expand_more</span>
          </button>
        </div>

        <div className={`bg-white dark:bg-night-charcoal rounded-[2.5rem] border border-primary/10 shadow-sm transition-all ${isCM ? 'p-8' : 'p-6'}`}>
          <div className="flex justify-between items-center mb-6">
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Adjust Proximity</span>
            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-black italic uppercase">
               {precision === 50 ? 'Midpoint' : `${precision}% Route`}
            </span>
          </div>
          <div className="py-4">
            <input 
              type="range" 
              min="0" max="100" 
              step="5"
              value={precision} 
              onChange={(e) => setPrecision(parseInt(e.target.value))}
              className="w-full h-4 bg-slate-200 dark:bg-white/10 rounded-full appearance-none cursor-pointer accent-primary" 
            />
            <div className="flex justify-between mt-5 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
              <div className="flex flex-col max-w-[100px]">
                 <span className="truncate">{origin}</span>
                 <span className="text-[8px] opacity-40">0%</span>
              </div>
              <div className="bg-primary text-white px-3 py-1.5 rounded-full flex flex-col items-center">
                <span className="leading-none">{precision}%</span>
              </div>
              <div className="flex flex-col items-end max-w-[100px] text-right">
                 <span className="truncate">{destination}</span>
                 <span className="text-[8px] opacity-40">100%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Calculation Box */}
        <div className={`bg-white dark:bg-night-charcoal rounded-[3rem] shadow-2xl border-t-8 border-primary dark:border-white/10 relative overflow-hidden transition-all ${isCM ? 'p-8' : 'p-8'}`}>
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
             <span className="material-icons text-9xl">explore</span>
          </div>

          <div className="text-center mb-6">
            <span className="bg-zinc-900 dark:bg-black text-white px-5 py-1.5 rounded-full text-[9px] font-black tracking-[0.2em] uppercase border border-white/10">Est. Computation</span>
          </div>
          
          <div className="flex flex-col text-center border-b dark:border-white/10 pb-6 mb-6">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Nearest Landmark</p>
              <h3 className={`${isCM ? 'text-3xl' : 'text-2xl'} font-black text-primary leading-tight mb-1 uppercase`}>{nearestStop.name}</h3>
              <div className="flex items-baseline justify-center gap-2">
                <span className={`${isCM ? 'text-5xl' : 'text-4xl'} font-900 leading-none dark:text-white tracking-tighter`}>KM {Math.round(estimatedKM)}</span>
                <span className="text-xs font-black text-slate-400">({estimatedKM.toFixed(1)})</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-6">
            <div className="bg-slate-50 dark:bg-white/5 py-4 px-2 rounded-3xl border-2 border-transparent transition-all text-center flex flex-col justify-center">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Regular</p>
              <div className="flex items-center justify-center">
                <span className={`${isCM ? 'text-lg' : 'text-sm'} mr-1 font-800 dark:text-white text-primary`}>₱</span>
                <p className={`${isCM ? 'text-3xl' : 'text-2xl'} font-900 dark:text-white leading-none tracking-tighter`}>{fares.reg}</p>
              </div>
            </div>
            <div className="bg-primary/5 dark:bg-primary/10 py-4 px-2 rounded-3xl border-2 border-primary/20 transition-all text-center flex flex-col justify-center">
              <p className="text-[9px] font-black text-primary uppercase mb-2">Discounted</p>
              <div className="flex items-center justify-center">
                <span className={`${isCM ? 'text-lg' : 'text-sm'} mr-1 font-800 text-primary`}>₱</span>
                <p className={`${isCM ? 'text-3xl' : 'text-2xl'} font-900 text-primary leading-none tracking-tighter`}>{fares.disc}</p>
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${isCM ? 'gap-4' : 'gap-3'}`}>
            <button 
              onClick={() => handleAddToTally(fares.reg, 'Regular')}
              className={`w-full bg-slate-900 dark:bg-black text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform ${isCM ? 'py-6' : 'py-4'}`}
            >
              <span className="material-icons text-sm">add_circle</span>
              Add Regular to Tally
            </button>
            <button 
              onClick={() => handleAddToTally(fares.disc, 'Discounted')}
              className={`w-full border-2 border-primary text-primary rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform ${isCM ? 'py-6' : 'py-4'}`}
            >
              <span className="material-icons text-sm">stars</span>
              Add Discounted to Tally
            </button>
          </div>
        </div>
      </div>

      {isOriginPickerOpen && (
        <StopPickerOverlay 
          isOpen={isOriginPickerOpen} 
          onClose={() => setIsOriginPickerOpen(false)} 
          onSelect={(name) => { setOrigin(name); setIsOriginPickerOpen(false); }} 
          title="From" 
        />
      )}
      {isDestPickerOpen && (
        <StopPickerOverlay 
          isOpen={isDestPickerOpen} 
          onClose={() => setIsDestPickerOpen(false)} 
          onSelect={(name) => { setDestination(name); setIsDestPickerOpen(false); }} 
          title="To" 
        />
      )}
    </div>
  );
};

export default BetweenStopsScreen;