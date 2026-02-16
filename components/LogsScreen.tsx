import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

interface Props {
  onExit?: () => void;
}

const LogsScreen: React.FC<Props> = ({ onExit }) => {
  const { settings, history, toggleFavorite, deleteHistory } = useApp();
  const [tab, setTab] = useState<'all' | 'fav'>('all');

  const filtered = tab === 'all' ? history : history.filter(h => h.isFavorite);
  const isCM = settings.conductorMode;

  return (
    <div className="flex flex-col min-h-full animate-fade-in bg-[#f8f6f6] dark:bg-black transition-all">
      {/* Red Header - Exactly as requested */}
      <header className="shrink-0 bg-primary flex items-center justify-between px-6 py-4 shadow-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="material-icons text-white text-2xl">history</span>
          <h1 className="text-xl font-medium text-white tracking-tight">History Logs</h1>
        </div>
        <button 
          onClick={onExit}
          className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-xl transition-colors flex items-center justify-center"
        >
          <span className="material-icons text-lg leading-none">close</span>
        </button>
      </header>

      <div className="sticky top-[72px] z-10 bg-[#f8f6f6]/80 dark:bg-black/80 backdrop-blur-lg px-4 pt-4 pb-4 border-b dark:border-white/10 flex items-center gap-3">
        <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-2xl flex flex-1">
          <button 
            onClick={() => setTab('all')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${tab === 'all' ? 'bg-white dark:bg-night-charcoal shadow-sm dark:text-white' : 'opacity-50 dark:text-slate-400'}`}
          >
            <span className="material-icons text-sm">history</span>HISTORY
          </button>
          <button 
            onClick={() => setTab('fav')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${tab === 'fav' ? 'bg-white dark:bg-night-charcoal shadow-sm dark:text-white' : 'opacity-50 dark:text-slate-400'}`}
          >
            <span className="material-icons text-sm">star</span>FAVORITES
          </button>
        </div>
        <button 
          onClick={deleteHistory} 
          className="w-12 h-12 flex items-center justify-center rounded-2xl bg-primary/10 text-primary active:scale-90 transition-transform shadow-sm border border-primary/10"
        >
          <span className="material-icons">delete_outline</span>
        </button>
      </div>

      <main className={`p-4 transition-all pb-24 ${isCM ? 'space-y-6' : 'space-y-4'}`}>
        {filtered.length === 0 ? (
          <div className="text-center py-20 opacity-30 dark:text-white">
            <span className="material-icons text-6xl">receipt_long</span>
            <p className="font-bold mt-4">No records found</p>
          </div>
        ) : (
          filtered.map(record => (
            <div key={record.id} className={`bg-white dark:bg-night-charcoal rounded-2xl border-2 relative overflow-hidden transition-all shadow-sm ${isCM ? 'p-10' : 'p-5'} ${record.type === 'tally' ? 'border-primary/20' : 'border-slate-100 dark:border-white/5'}`}>
              {record.type === 'tally' && (
                <div className="absolute top-0 right-0 px-3 py-1 bg-primary text-white text-[8px] font-black uppercase rounded-bl-xl">Waybill Entry</div>
              )}
              
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-2">
                  <span className={`font-black bg-slate-100 dark:bg-white/10 dark:text-slate-300 px-2 py-1 rounded ${isCM ? 'text-[12px]' : 'text-[10px]'}`}>
                    {new Date(record.timestamp).toLocaleDateString()} {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <button onClick={() => toggleFavorite(record.id)}>
                  <span className={`material-icons ${isCM ? 'text-3xl' : 'text-2xl'} ${record.isFavorite ? 'text-primary' : 'text-slate-200 dark:text-white/10'}`}>star</span>
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-900 leading-tight dark:text-white transition-all ${isCM ? 'text-3xl' : 'text-lg'} ${record.type === 'tally' ? 'text-primary' : ''}`}>{record.origin}</h3>
                  <div className="flex items-center gap-2 my-2">
                    <span className="material-icons text-primary rotate-90 text-sm">arrow_right_alt</span>
                    <span className={`font-black text-slate-400 ${isCM ? 'text-[12px]' : 'text-[10px]'}`}>
                      {record.type === 'tally' ? 'Final Audit' : `${record.distance.toFixed(1)} km`}
                    </span>
                  </div>
                  <h3 className={`font-900 leading-tight dark:text-white transition-all ${isCM ? 'text-3xl' : 'text-lg'}`}>{record.destination}</h3>
                </div>
                <div className="text-right">
                  <p className={`font-900 text-primary transition-all ${isCM ? 'text-5xl' : 'text-3xl'}`}>₱{record.regularFare}</p>
                  {record.type !== 'tally' && (
                    <p className={`font-black text-slate-400 uppercase mt-1 transition-all ${isCM ? 'text-[12px]' : 'text-[9px]'}`}>Disc: ₱{record.discountedFare}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
};

export default LogsScreen;
