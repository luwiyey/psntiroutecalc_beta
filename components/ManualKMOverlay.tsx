
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { MIN_REGULAR_FARE, MIN_DISCOUNT_FARE } from '../constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ManualKMOverlay: React.FC<Props> = ({ isOpen, onClose }) => {
  const { settings, addRecord, showToast } = useApp();
  const [pickup, setPickup] = useState('');
  const [dest, setDest] = useState('');
  const [activeInput, setActiveInput] = useState<'pickup' | 'dest'>('pickup');
  const [useCustomKeypad, setUseCustomKeypad] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const pickupRef = useRef<HTMLInputElement>(null);
  const destRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => pickupRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const distance = useMemo(() => {
    const p = parseFloat(pickup);
    const d = parseFloat(dest);
    if (isNaN(p) || isNaN(d)) return 0;
    return Math.abs(d - p);
  }, [pickup, dest]);

  const calculation = useMemo(() => {
    if (distance === 0) return { reg: 0, disc: 0, isMin: false };
    
    const rawReg = distance * settings.regularRate;
    const rawDisc = distance * settings.discountRate;
    
    const roundedReg = Math.ceil(rawReg - 0.5);
    const roundedDisc = Math.ceil(rawDisc - 0.5);

    const finalReg = Math.max(roundedReg, MIN_REGULAR_FARE);
    const finalDisc = Math.max(roundedDisc, MIN_DISCOUNT_FARE);

    return {
      reg: finalReg,
      disc: finalDisc,
      isMin: finalReg === MIN_REGULAR_FARE || finalDisc === MIN_DISCOUNT_FARE
    };
  }, [distance, settings]);

  const handleKeypadPress = (key: string) => {
    const isPickup = activeInput === 'pickup';
    const setter = isPickup ? setPickup : setDest;
    const current = isPickup ? pickup : dest;
    
    if (key === 'DEL') {
      setter(current.slice(0, -1));
    } else if (key === '.') {
      if (!current.includes('.') && current.length < 3) setter(current + '.');
    } else if (key === 'CLR') {
      setter('');
    } else if (key === 'NEXT') {
      if (isPickup) {
        setActiveInput('dest');
        destRef.current?.focus();
      }
    } else if (current.length < 3) {
      const newVal = current + key;
      const finalVal = newVal.slice(0, 3);
      setter(finalVal);

      if (isPickup && finalVal.length === 3) {
        setTimeout(() => {
          setActiveInput('dest');
          destRef.current?.focus();
        }, 100);
      }
    }
  };

  const handleLog = () => {
    if (distance <= 0) return;
    addRecord({
      origin: `KM ${pickup}`,
      destination: `KM ${dest}`,
      distance,
      regularFare: calculation.reg,
      discountedFare: calculation.disc,
      isFavorite: isFavorite
    });
    showToast('Manual entry recorded');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-[#f8f6f6] dark:bg-black flex flex-col animate-fade-in">
      <header 
        className="bg-white dark:bg-night-charcoal px-4 pb-4 border-b border-primary/10 flex items-center justify-between shadow-sm shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <button onClick={onClose} className="flex items-center text-primary font-bold px-2 py-1 active:opacity-50 transition-opacity">
          <span className="material-icons">close</span>
          <span className="text-xs ml-1 font-black uppercase tracking-widest">Cancel</span>
        </button>
        <h1 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Manual KM Entry</h1>
        <button 
          onClick={() => setUseCustomKeypad(!useCustomKeypad)}
          className={`px-3 py-1.5 rounded-full flex items-center gap-1 transition-all ${useCustomKeypad ? 'bg-primary text-white shadow-md' : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300'}`}
        >
          <span className="material-icons text-sm">{useCustomKeypad ? 'apps' : 'keyboard_hide'}</span>
          <span className="text-[10px] font-black uppercase">{useCustomKeypad ? 'Pad ON' : 'Use Pad'}</span>
        </button>
      </header>

      <main className="flex-1 p-4 space-y-4 overflow-y-auto pb-10">
        <div className="text-center mb-2">
           <span className="text-[10px] font-black text-primary uppercase tracking-widest bg-primary/5 px-4 py-1 rounded-full border border-primary/10">
             Editing: {activeInput === 'pickup' ? 'START KM' : 'END KM'}
           </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div 
            onClick={() => { setActiveInput('pickup'); pickupRef.current?.focus(); }}
            className={`relative bg-white dark:bg-night-charcoal border-2 rounded-2xl p-4 transition-all ${activeInput === 'pickup' ? 'border-primary ring-4 ring-primary/10 shadow-lg scale-[1.02]' : 'border-slate-200 dark:border-white/10 opacity-70'}`}
          >
            <label className="text-[9px] font-black uppercase text-primary block mb-1">Start KM</label>
            <div className="flex items-center justify-between">
              <input
                ref={pickupRef}
                type="number"
                inputMode={useCustomKeypad ? "none" : "decimal"}
                placeholder="---"
                maxLength={3}
                className="w-full bg-transparent border-none p-0 text-3xl font-black focus:ring-0 placeholder-slate-300 dark:placeholder-slate-700"
                value={pickup}
                onFocus={() => {
                  setActiveInput('pickup');
                  if (!useCustomKeypad) setIsKeyboardVisible(true);
                }}
                onBlur={() => setIsKeyboardVisible(false)}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 3);
                  setPickup(val);
                  if (val.length === 3) {
                    setActiveInput('dest');
                    destRef.current?.focus();
                  }
                }}
              />
              {pickup && (
                <button onClick={(e) => { e.stopPropagation(); setPickup(''); }} className="material-icons text-slate-400 text-lg">cancel</button>
              )}
            </div>
          </div>

          <div 
            onClick={() => { setActiveInput('dest'); destRef.current?.focus(); }}
            className={`relative bg-white dark:bg-night-charcoal border-2 rounded-2xl p-4 transition-all ${activeInput === 'dest' ? 'border-primary ring-4 ring-primary/10 shadow-lg scale-[1.02]' : 'border-slate-200 dark:border-white/10 opacity-70'}`}
          >
            <label className="text-[9px] font-black uppercase text-primary block mb-1">End KM</label>
            <div className="flex items-center justify-between">
              <input
                ref={destRef}
                type="number"
                inputMode={useCustomKeypad ? "none" : "decimal"}
                placeholder="---"
                maxLength={3}
                className="w-full bg-transparent border-none p-0 text-3xl font-black focus:ring-0 placeholder-slate-300 dark:placeholder-slate-700"
                value={dest}
                onFocus={() => {
                  setActiveInput('dest');
                  if (!useCustomKeypad) setIsKeyboardVisible(true);
                }}
                onBlur={() => setIsKeyboardVisible(false)}
                onChange={(e) => setDest(e.target.value.slice(0, 3))}
              />
              {dest && (
                <button onClick={(e) => { e.stopPropagation(); setDest(''); }} className="material-icons text-slate-400 text-lg">cancel</button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 text-white rounded-[2.5rem] p-7 shadow-2xl border-t-8 border-primary relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
             <span className="material-icons text-8xl">explore</span>
          </div>
          <div className="flex justify-between items-center mb-6">
            <span className="text-[10px] font-black uppercase text-white/60 tracking-widest">Calculated Route</span>
          </div>
          <div className="flex justify-between items-end mb-8">
            <div>
               <p className="text-4xl font-900 leading-none">{distance.toFixed(2)}</p>
               <p className="text-[10px] font-black uppercase text-white/60 mt-2">Total Kilometers</p>
            </div>
            <button 
              onClick={() => { const t = pickup; setPickup(dest); setDest(t); }} 
              className="p-4 bg-primary text-white rounded-2xl active:scale-90 transition-transform shadow-lg border border-white/20"
            >
               <span className="material-icons text-2xl">swap_horiz</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 divide-x divide-white/20">
            <div className="pr-2">
              <p className="text-[10px] font-black uppercase text-primary mb-1">Regular</p>
              <p className="text-4xl font-black text-white">₱{calculation.reg}</p>
            </div>
            <div className="pl-6">
              <p className="text-[10px] font-black uppercase text-green-400 mb-1">Discount</p>
              <p className="text-4xl font-black text-white">₱{calculation.disc}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-white dark:bg-night-charcoal p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
          <div className="flex items-center gap-3">
            <span className={`material-icons text-2xl transition-colors ${isFavorite ? 'text-primary' : 'text-slate-300 dark:text-slate-600'}`}>star</span>
            <span className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">Save as Favorite</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={isFavorite} onChange={(e) => setIsFavorite(e.target.checked)} className="sr-only peer" />
            <div className="w-12 h-7 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>

        <button 
          onClick={handleLog}
          disabled={distance <= 0}
          className="w-full bg-primary disabled:bg-slate-300 dark:disabled:bg-white/10 text-white py-6 rounded-3xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all text-sm mb-4"
        >
          {isFavorite ? 'Confirm & Save Favorite' : 'Record Distance Entry'}
        </button>
      </main>

      {useCustomKeypad && !isKeyboardVisible && (
        <div className="bg-white dark:bg-night-charcoal border-t border-slate-200 dark:border-white/10 p-3 grid grid-cols-4 gap-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(0,0,0,0.1)] shrink-0">
          {[
            '1','2','3','DEL',
            '4','5','6','NEXT',
            '7','8','9','CLR',
            '.', '0', '00', 'DONE'
          ].map(k => (
            <button 
              key={k}
              onClick={() => {
                if (k === 'DONE') {
                   pickupRef.current?.blur();
                   destRef.current?.blur();
                } else handleKeypadPress(k);
              }}
              className={`h-14 rounded-xl text-xl font-black active:bg-primary active:text-white transition-all transform active:scale-90 ${['DEL', 'NEXT', 'CLR', 'DONE'].includes(k) ? 'bg-primary/10 text-primary text-[10px]' : 'bg-slate-100 dark:bg-white/10 dark:text-white shadow-sm border border-slate-200 dark:border-white/5'}`}
            >
              {k === 'DEL' ? <span className="material-icons text-base">backspace</span> : k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ManualKMOverlay;
