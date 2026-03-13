
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
  title: string;
}

const StopPickerOverlay: React.FC<Props> = ({ isOpen, onClose, onSelect, title }) => {
  const [search, setSearch] = useState('');
  const { activeRoute } = useApp();

  useEffect(() => {
    if (isOpen) {
      setSearch('');
    }
  }, [activeRoute.id, isOpen]);

  if (!isOpen) return null;

  const filteredStops = activeRoute.stops.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const formatKM = (km: number) => {
    return km % 1 === 0 ? km.toString() : km.toFixed(1);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white dark:bg-black flex flex-col animate-fade-in">
      <header 
        className="px-4 pb-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <button onClick={onClose} className="p-2 -ml-2 active:opacity-50 transition-opacity">
          <span className="material-icons text-slate-600 dark:text-white">chevron_left</span>
        </button>
        <h1 className="text-sm font-900 tracking-widest uppercase text-slate-800 dark:text-white">Select {title}</h1>
        <div className="w-10"></div>
      </header>

      <div className="p-4 bg-slate-50 dark:bg-night-charcoal">
        <div className="relative mb-5">
          <span className="material-icons absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input 
            autoFocus
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-black border-2 border-slate-100 dark:border-white/10 rounded-2xl outline-none focus:border-primary transition-colors font-bold text-slate-800 dark:text-white"
            placeholder={`Search ${title.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Quick Access Terminals</p>
        <div className="grid grid-cols-3 gap-2">
          {activeRoute.stops.filter(s => s.isTerminal).map(terminal => (
            <button 
              key={terminal.name}
              onClick={() => onSelect(terminal.name)}
              className="bg-red-50 dark:bg-primary/20 border border-primary/20 text-primary p-3 rounded-xl flex flex-col items-center gap-1 active:bg-primary active:text-white transition-all shadow-sm"
            >
              <span className="material-icons text-sm opacity-70">location_on</span>
              <span className="text-[10px] font-black uppercase truncate w-full text-center tracking-tighter">{terminal.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 divide-y dark:divide-white/5">
        <div className="flex justify-between items-center py-4 sticky top-0 bg-white dark:bg-black z-10">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Route Stops</span>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">KM Marker</span>
        </div>
        {filteredStops.map(stop => (
          <button 
            key={stop.name}
            onClick={() => onSelect(stop.name)}
            className="w-full flex justify-between items-center py-5 active:bg-slate-50 dark:active:bg-white/5 transition-colors text-left group"
          >
            <div className="flex items-center gap-4 flex-1 mr-4">
              <div className="w-1.5 h-1.5 rounded-full bg-primary group-active:scale-150 transition-transform shrink-0" />
              <span className="text-xl font-800 text-slate-800 dark:text-white text-left leading-tight">{stop.name}</span>
            </div>
            <span className="text-[10px] font-black text-primary bg-primary/10 border border-primary/10 px-2 py-0.5 rounded-md shrink-0 uppercase tracking-tighter">
              KM {formatKM(stop.km)}
            </span>
          </button>
        ))}
        
        {filteredStops.length === 0 && (
          <div className="py-20 text-center opacity-30">
            <span className="material-icons text-5xl">search_off</span>
            <p className="font-bold mt-2">No stops match "{search}"</p>
          </div>
        )}
      </div>
      
      <div style={{ height: 'calc(env(safe-area-inset-bottom) + 12px)' }} className="bg-white dark:bg-black shrink-0" />
    </div>
  );
};

export default StopPickerOverlay;
