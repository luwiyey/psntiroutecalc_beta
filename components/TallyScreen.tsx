import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { TallyTrip, TallySheet } from '../types';

type EditorMode = 'standard' | 'batch';

interface Props {
  onExit?: () => void;
}

const TallyScreen: React.FC<Props> = ({ onExit }) => {
  const { settings, sessions, setSessions, tallyNav, setTallyNav, showToast } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find(s => s.id === tallyNav.sessionId) || sessions[sessions.length - 1];
  const activeTrip = activeSession.trips[tallyNav.tripIdx] || activeSession.trips[0];
  const activeSheet = activeTrip.sheets[tallyNav.sheetIdx] || activeTrip.sheets[0];

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('standard');
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number>(0);
  const [stagedStandardEntries, setStagedStandardEntries] = useState<number[]>([]);
  const [editValue, setEditValue] = useState('');
  const [isFlashing, setIsFlashing] = useState(false);
  const [lastPunched, setLastPunched] = useState<number | null>(null);
  const [batchCounts, setBatchCounts] = useState<Record<number, string>>({});
  const [batchSearch, setBatchSearch] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [isFooterCollapsed, setIsFooterCollapsed] = useState(true);
  
  const [pendingAction, setPendingAction] = useState<{ type: 'trip' | 'sheet' | 'reset-block' | 'flip-direction' | 'reset-batch'; blockIdx?: number } | null>(null);

  const commonFares = [20, 25, 30, 35, 40, 50, 60, 75, 100, 120, 150, 200];
  const allBatchFares = useMemo(() => Array.from({ length: 211 }, (_, i) => i + 16), []);
  
  const filteredBatchFares = useMemo(() => {
    let fares = allBatchFares;
    if (batchSearch) {
      if (batchSearch.includes('-')) {
        const [start, end] = batchSearch.split('-').map(v => parseInt(v.trim()));
        if (!isNaN(start) && !isNaN(end)) fares = fares.filter(f => f >= start && f <= end);
      } else {
        fares = fares.filter(f => f.toString().includes(batchSearch));
      }
    }
    if (showOnlySelected) fares = fares.filter(f => (parseInt(batchCounts[f]) || 0) > 0);
    return fares;
  }, [batchSearch, allBatchFares, showOnlySelected, batchCounts]);

  const blockTotals = useMemo(() => {
    return [0, 1, 2, 3].map(blockIdx => {
      const slice = activeSheet.slots.slice(blockIdx * 25, (blockIdx + 1) * 25);
      return slice.reduce((a, b) => a + b, 0);
    });
  }, [activeSheet]);

  const blockFilledCounts = useMemo(() => {
    return [0, 1, 2, 3].map(blockIdx => {
      const slice = activeSheet.slots.slice(blockIdx * 25, (blockIdx + 1) * 25);
      return slice.filter(val => val > 0).length;
    });
  }, [activeSheet]);

  const sheetTotal = useMemo(() => activeSheet.slots.reduce((a, b) => a + b, 0), [activeSheet]);

  const batchTotalGross = useMemo(() => {
    return (Object.entries(batchCounts) as [string, string][]).reduce((sum: number, [fare, count]) => {
      const qty = parseInt(count) || 0;
      return sum + (parseInt(fare) * qty);
    }, 0);
  }, [batchCounts]);

  const stagedTotalGross = useMemo(() => stagedStandardEntries.reduce((a, b) => a + b, 0), [stagedStandardEntries]);
  const currentTypingValue = parseInt(editValue) || 0;
  const grandTotalInEditor = useMemo(() => stagedTotalGross + batchTotalGross + currentTypingValue, [stagedTotalGross, batchTotalGross, currentTypingValue]);
  
  const handleAddTrip = () => {
    const lastTrip = activeSession.trips[activeSession.trips.length - 1];
    const nextDir = lastTrip.direction === 'north' ? 'south' : 'north';
    const newTrip: TallyTrip = {
      id: `trip-${Date.now()}`,
      name: `Trip ${activeSession.trips.length + 1}`,
      direction: nextDir,
      sheets: [{ id: `sheet-${Date.now()}`, slots: Array(100).fill(0), status: 'in-progress', lastUpdatedAt: Date.now() }]
    };
    setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, trips: [...s.trips, newTrip] } : s));
    setTallyNav(n => ({ ...n, tripIdx: activeSession.trips.length, sheetIdx: 0, blockIdx: 0 }));
    setPendingAction(null);
  };

  const handleAddSheet = () => {
    const newSheet: TallySheet = { id: `sheet-${Date.now()}`, slots: Array(100).fill(0), status: 'in-progress', lastUpdatedAt: Date.now() };
    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s, trips: s.trips.map((t, ti) => ti === tallyNav.tripIdx ? { ...t, sheets: [...t.sheets, newSheet] } : t)
    } : s));
    setTallyNav(n => ({ ...n, sheetIdx: activeTrip.sheets.length, blockIdx: 0 }));
    setPendingAction(null);
  };

  const handleFlipDirection = () => {
    const nextDir = activeTrip.direction === 'north' ? 'south' : 'north';
    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s, trips: s.trips.map((t, ti) => ti === tallyNav.tripIdx ? { ...t, direction: nextDir } : t)
    } : s));
    setPendingAction(null);
  };

  const handleResetBlock = (bIdx: number) => {
    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s, trips: s.trips.map((t, ti) => ti === tallyNav.tripIdx ? {
        ...t, sheets: t.sheets.map((sh, si) => si === tallyNav.sheetIdx ? {
          ...sh, slots: sh.slots.map((sl, sli) => (sli >= bIdx * 25 && sli < (bIdx + 1) * 25) ? 0 : sl), lastUpdatedAt: Date.now()
        } : sh)
      } : t)
    } : s));
    setPendingAction(null);
  };

  const handleResetBatch = () => {
    setBatchCounts({});
    setBatchSearch('');
    setShowOnlySelected(false);
    setPendingAction(null);
  };

  const handleSlotClick = (idx: number) => {
    if (activeSheet.status === 'recorded' || activeSession.status === 'closed') return;
    setSelectedSlotIdx(idx);
    setStagedStandardEntries([]);
    setEditValue('');
    setBatchCounts({});
    setBatchSearch('');
    setIsEditorOpen(true);
    setIsFooterCollapsed(true);
  };

  const commitStandardEntry = (val: number, isTileClick = false) => {
    if (isNaN(val) || val <= 0) return;
    setLastPunched(val);
    setIsFlashing(true);
    setStagedStandardEntries(prev => [...prev, val]);
    setEditValue('');
    setTimeout(() => setIsFlashing(false), 150);
    if (!isTileClick) inputRef.current?.focus();
  };

  const handleConfirmAll = () => {
    const finalEntries = [...stagedStandardEntries];
    if (currentTypingValue > 0) finalEntries.push(currentTypingValue);
    (Object.entries(batchCounts) as [string, string][]).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([fare, count]) => {
      const qty = parseInt(count) || 0;
      for (let i = 0; i < qty; i++) finalEntries.push(parseInt(fare));
    });
    if (finalEntries.length === 0) return;
    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s, trips: s.trips.map((t, ti) => ti === tallyNav.tripIdx ? {
        ...t, sheets: t.sheets.map((sh, si) => si === tallyNav.sheetIdx ? {
          ...sh, slots: sh.slots.map((sl, sli) => {
            const offset = sli - selectedSlotIdx;
            if (offset >= 0 && offset < finalEntries.length) return finalEntries[offset];
            return sl;
          }), lastUpdatedAt: Date.now()
        } : sh)
      } : t)
    } : s));
    setIsEditorOpen(false);
  };

  const isCM = settings.conductorMode;

  const getModalContent = () => {
    if (!pendingAction) return null;
    switch (pendingAction.type) {
      case 'sheet':
        return {
          title: 'START NEW SHEET',
          desc: 'Confirm your action. Previous data is always saved automatically in device memory.',
          confirm: 'CONFIRM ACTION'
        };
      case 'trip':
        return {
          title: 'START NEW TRIP',
          desc: 'Ready to start the next trip? This will switch direction automatically.',
          confirm: 'CONFIRM NEW TRIP'
        };
      case 'reset-block':
        return {
          title: `RESET BLOCK B${(pendingAction.blockIdx || 0) + 1}`,
          desc: 'Are you sure you want to clear all 25 slots in this block? This cannot be undone.',
          confirm: 'RESET BLOCK'
        };
      case 'flip-direction':
        return {
          title: 'CHANGE DIRECTION',
          desc: 'Switch current heading? This affects future calculations.',
          confirm: 'SWITCH HEADING'
        };
      case 'reset-batch':
        return {
          title: 'CLEAR BATCH LIST',
          desc: 'This will reset all current ticket counts in the batch editor to zero.',
          confirm: 'CLEAR LIST'
        };
      default:
        return { title: 'CONFIRM ACTION', desc: 'Proceed with requested system update?', confirm: 'CONFIRM' };
    }
  };

  const modalContent = getModalContent();

  return (
    <div className="flex flex-col min-h-full bg-white dark:bg-black transition-all overflow-hidden m-0 p-0">
      {/* Red Header precisely matching screenshot */}
      <header className="shrink-0 bg-primary flex items-center justify-between px-6 py-4 shadow-md sticky top-0 z-40 m-0">
        <div className="flex items-center gap-3">
          <span className="material-icons text-white text-3xl">fact_check</span>
          <h1 className="text-2xl font-medium text-white tracking-tight">Tally Sheet</h1>
        </div>
        <button 
          onClick={onExit}
          className="bg-white/10 hover:bg-white/20 text-white w-12 h-12 rounded-2xl transition-colors flex items-center justify-center border border-white/10"
        >
          <span className="material-icons text-2xl leading-none">close</span>
        </button>
      </header>

      {/* Navigation Area */}
      <div className="bg-white dark:bg-night-charcoal h-auto shrink-0 transition-all m-0 p-0">
        <div className="flex bg-white dark:bg-night-charcoal h-16 items-center border-b border-slate-50 dark:border-white/5">
          <div className="flex flex-1 overflow-x-auto scrollbar-hide h-full">
            {activeSession.trips.map((t, i) => (
              <button key={t.id} onClick={() => setTallyNav(n => ({ ...n, tripIdx: i, sheetIdx: 0, blockIdx: 0 }))} 
                className={`flex-shrink-0 h-full transition-all flex items-center justify-center min-w-[120px] relative px-6 ${tallyNav.tripIdx === i ? 'text-primary' : 'text-slate-300'}`}>
                <span className="font-900 uppercase tracking-widest text-[13px]">{t.name}</span>
                {tallyNav.tripIdx === i && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary" />}
              </button>
            ))}
          </div>
          <button onClick={() => setPendingAction({ type: 'trip' })} className="w-16 h-full flex items-center justify-center text-primary active:scale-90">
             <span className="material-icons text-3xl">add_circle</span>
          </button>
        </div>

        <div className="flex bg-white dark:bg-night-charcoal h-16 items-center border-b border-slate-50 dark:border-white/5">
          <div className="flex flex-1 overflow-x-auto scrollbar-hide h-full">
            {activeTrip.sheets.map((s, i) => (
              <button key={s.id} onClick={() => setTallyNav(n => ({ ...n, sheetIdx: i, blockIdx: 0 }))} 
                className={`flex-shrink-0 h-full transition-all flex items-center justify-center min-w-[120px] relative px-6 ${tallyNav.sheetIdx === i ? 'text-primary' : 'text-slate-300'}`}>
                <span className="font-900 uppercase tracking-widest text-[13px]">Sheet {i + 1}</span>
                {tallyNav.sheetIdx === i && <div className="absolute bottom-0 left-10 right-10 h-1 bg-primary rounded-full" />}
              </button>
            ))}
          </div>
          <button onClick={() => setPendingAction({ type: 'sheet' })} className="w-16 h-full flex items-center justify-center text-slate-200 hover:text-primary transition-colors">
             <span className="material-icons text-3xl">add</span>
          </button>
        </div>

        <div className="px-5 py-5 flex items-center justify-between bg-white dark:bg-night-charcoal">
          <button onClick={() => setPendingAction({ type: 'flip-direction' })} className="flex items-center gap-4 bg-slate-50 dark:bg-white/5 pr-6 rounded-3xl border border-slate-100 dark:border-white/10 active:scale-95 transition-all">
            <div className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-md">
              <span className="material-icons text-2xl">{activeTrip.direction === 'north' ? 'arrow_upward' : 'arrow_downward'}</span>
            </div>
            <div className="text-left">
              <p className="text-[9px] font-black uppercase text-slate-400 leading-none mb-1 tracking-widest">Heading</p>
              <h2 className="text-[15px] font-black uppercase text-slate-900 dark:text-white leading-none tracking-tight">
                {activeTrip.direction === 'north' ? 'Baguio' : 'Bayambang'}
              </h2>
            </div>
          </button>
          
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Sheet Total</p>
            <div className="flex items-baseline justify-end gap-0.5">
              <span className="text-xl font-900 text-primary">₱</span>
              <span className="text-4xl font-900 text-primary leading-none">{sheetTotal}</span>
            </div>
          </div>
        </div>

        <div className="flex px-5 pt-2 pb-2 gap-4 bg-white dark:bg-night-charcoal">
          {[0, 1, 2, 3].map(b => (
            <div key={b} className="flex-1 flex flex-col items-center gap-1.5">
               <button onClick={() => setTallyNav(n => ({ ...n, blockIdx: b }))}
                 className={`w-full aspect-[4/3] rounded-[1.25rem] font-black border flex flex-col items-center justify-center transition-all ${tallyNav.blockIdx === b ? 'bg-white dark:bg-night-charcoal border-primary ring-4 ring-primary/10 text-primary shadow-lg' : 'bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/5 text-slate-400'}`}>
                 <span className="font-black uppercase tracking-tighter text-[11px] leading-none mb-1">B{b+1}({blockFilledCounts[b]}/25)</span>
                 <span className="text-[13px] leading-none font-900">₱{blockTotals[b]}</span>
               </button>
               <button onClick={() => setPendingAction({ type: 'reset-block', blockIdx: b })} className="text-slate-300 hover:text-primary p-1 active:scale-90 transition-all">
                 <span className="material-icons text-[18px]">refresh</span>
               </button>
            </div>
          ))}
        </div>
      </div>

      {/* Grid Content */}
      <div className={`p-5 grid grid-cols-5 flex-1 overflow-y-auto mt-2 bg-slate-50 dark:bg-black ${isCM ? 'gap-6' : 'gap-4'}`}>
        {activeSheet.slots.slice(tallyNav.blockIdx * 25, (tallyNav.blockIdx + 1) * 25).map((val, i) => {
          const idx = tallyNav.blockIdx * 25 + i;
          return (
            <button key={idx} onClick={() => handleSlotClick(idx)}
              className={`aspect-square rounded-[1.25rem] border-2 flex flex-col items-center justify-center relative transition-all shadow-sm ${val > 0 ? 'bg-primary border-primary text-white shadow-md scale-105 z-10' : 'bg-white dark:bg-night-charcoal border-slate-100 dark:border-white/5 text-slate-200 hover:border-primary/40 active:scale-95'}`}>
              <span className={`font-black opacity-30 absolute top-2 left-2 ${isCM ? 'text-[10px]' : 'text-[8px]'}`}>{idx + 1}</span>
              <span className={`font-900 leading-none ${isCM ? 'text-3xl' : 'text-xl'}`}>{val || '—'}</span>
            </button>
          );
        })}
      </div>

      {isEditorOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setIsEditorOpen(false)} />
          <div className="relative bg-white dark:bg-night-charcoal rounded-t-[3.5rem] shadow-2xl h-full mt-2 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            <input ref={inputRef} type="number" inputMode="numeric" className="absolute top-0 opacity-0 pointer-events-none" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitStandardEntry(parseInt(editValue) || 0); } }} />
            <div className="shrink-0 bg-primary flex items-center justify-between px-6 py-4">
               <div className="flex items-center gap-3">
                 <span className="material-icons text-white bg-white/20 p-2 rounded-xl text-2xl">fact_check</span>
                 <h1 className="text-xl font-medium text-white tracking-tight">Tally Sheet</h1>
               </div>
               <button onClick={() => setIsEditorOpen(false)} className="bg-white/20 text-white p-2 rounded-xl"><span className="material-icons">close</span></button>
            </div>
            <div className={`shrink-0 px-8 pt-8 pb-4 transition-all ${isCM ? 'space-y-8' : 'space-y-4'}`}>
              <div className="flex gap-4">
                <div className="flex-1 bg-slate-50 dark:bg-black/30 p-5 rounded-3xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Slot Information</p>
                  <h2 className="font-900 text-slate-800 dark:text-white uppercase leading-none text-[16px]">B{Math.floor((selectedSlotIdx+stagedStandardEntries.length)/25)+1} Slot {selectedSlotIdx+stagedStandardEntries.length+1}</h2>
                </div>
                <div className="flex-1 bg-zinc-900 dark:bg-black p-5 rounded-3xl border-b-4 border-black/40 shadow-lg">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Gross</p>
                  <p className={`font-900 text-white leading-none ${isCM ? 'text-4xl' : 'text-2xl'}`}>₱{grandTotalInEditor}</p>
                </div>
              </div>
              <button onClick={() => inputRef.current?.focus()} className={`w-full rounded-[3rem] border-2 flex flex-col items-center justify-center transition-all active:scale-95 ${isCM ? 'py-14' : 'py-8'} ${isFlashing ? 'bg-neon-green/10 border-neon-green' : 'bg-slate-50 dark:bg-black/40 border-slate-100 shadow-inner'}`}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-slate-400">Punch Amount</p>
                <div className="flex items-center gap-2">
                  <span className="font-900 text-slate-400 text-3xl">₱</span>
                  <h3 className={`font-900 leading-none transition-colors ${isCM ? 'text-7xl' : 'text-5xl'} ${isFlashing ? 'text-neon-green' : (editValue ? 'text-primary' : 'text-slate-900 dark:text-white')}`}>
                    {editorMode === 'batch' ? batchTotalGross : (isFlashing ? lastPunched : (editValue || '0'))}
                  </h3>
                </div>
              </button>
              <div className="flex bg-slate-100 dark:bg-black/40 p-1.5 rounded-full border dark:border-white/5">
                <button onClick={() => setEditorMode('standard')} className={`flex-1 py-4 rounded-full font-black uppercase text-[11px] tracking-widest transition-all ${editorMode === 'standard' ? 'bg-white dark:bg-night-charcoal text-primary shadow-sm' : 'text-slate-400'}`}>Standard</button>
                <button onClick={() => setEditorMode('batch')} className={`flex-1 py-4 rounded-full font-black uppercase text-[11px] tracking-widest transition-all ${editorMode === 'batch' ? 'bg-white dark:bg-night-charcoal text-primary shadow-sm' : 'text-slate-400'}`}>Batch Mode</button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-8">
              {editorMode === 'standard' ? (
                <div className="flex-1 overflow-y-auto pb-6">
                  <div className={`grid grid-cols-3 ${isCM ? 'gap-6' : 'gap-4'}`}>
                    {commonFares.map(f => (
                      <button key={f} onClick={() => commitStandardEntry(f, true)} className="aspect-square bg-primary text-white rounded-[2.5rem] font-black shadow-lg active:scale-90 transition-transform text-3xl flex items-center justify-center border-b-4 border-black/20">{f}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="shrink-0 mb-4">
                    <div className="relative flex-1 mb-4">
                      <span className="material-icons absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-2xl">search</span>
                      <input type="number" inputMode="numeric" placeholder="Search Fare..." className="w-full pl-14 pr-6 py-5 bg-slate-50 dark:bg-white/5 border-2 border-slate-100 rounded-[1.5rem] font-black text-lg outline-none focus:border-primary" value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto visible-scrollbar pr-1 mb-6">
                    <div className="divide-y dark:divide-white/5">
                      {filteredBatchFares.map(f => (
                        <div key={f} className={`flex items-center justify-between py-5 ${batchCounts[f] ? 'bg-primary/5 rounded-2xl px-3' : ''}`}>
                          <p className={`font-900 ${batchCounts[f] ? 'text-primary text-2xl' : 'text-xl dark:text-white'}`}>₱{f}</p>
                          <div className="flex items-center gap-4">
                            <button onClick={() => setBatchCounts(p => ({...p, [f]: Math.max(0, parseInt(p[f] || '0') - 1).toString()}))} className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center active:scale-90 transition-transform"><span className="material-icons">remove</span></button>
                            <input type="number" inputMode="numeric" className="w-20 h-12 bg-white dark:bg-black border-2 rounded-xl text-center font-900 text-2xl" value={batchCounts[f] || ''} onChange={e => setBatchCounts(p => ({...p, [f]: e.target.value}))} />
                            <button onClick={() => setBatchCounts(p => ({...p, [f]: (parseInt(p[f] || '0') + 1).toString()}))} className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center active:scale-90 transition-transform"><span className="material-icons">add</span></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className={`shrink-0 bg-white dark:bg-night-charcoal border-t transition-all duration-300 overflow-hidden ${isFooterCollapsed ? 'max-h-[80px]' : 'max-h-[300px]'}`}>
               {isFooterCollapsed ? (
                 <div onClick={() => setIsFooterCollapsed(false)} className="flex items-center justify-between px-10 py-6 cursor-pointer hover:bg-slate-50 transition-colors">
                   <div className="flex items-center gap-4">
                     <span className="material-icons text-emerald-500 text-2xl">check_circle</span>
                     <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Review & Finalize</p>
                   </div>
                   <div className="flex items-center gap-6">
                     <p className="font-900 text-primary text-3xl">₱{grandTotalInEditor}</p>
                     <span className="material-icons text-slate-300">expand_less</span>
                   </div>
                 </div>
               ) : (
                 <div className="px-10 pt-8 pb-14 text-center">
                   <p className="text-sm font-bold text-slate-500 mb-8 uppercase tracking-[0.2em]">Ready to commit this waybill session?</p>
                   <button onClick={handleConfirmAll} disabled={grandTotalInEditor === 0} className="w-full bg-primary text-white py-7 rounded-[2.5rem] font-black uppercase text-[15px] shadow-2xl active:scale-95 border-b-4 border-black/20 flex items-center justify-center gap-3">
                     Finalize Waybill ₱{grandTotalInEditor} <span className="material-icons">task_alt</span>
                   </button>
                   <button onClick={() => setIsFooterCollapsed(true)} className="mt-6 text-slate-400 font-bold uppercase text-[11px]">Keep Editing</button>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {pendingAction && modalContent && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
           <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setPendingAction(null)} />
           <div className="relative bg-white dark:bg-night-charcoal rounded-[3.5rem] p-10 w-full shadow-2xl flex flex-col items-center">
              <h3 className="text-[22px] font-black text-slate-800 dark:text-white mb-4 uppercase tracking-tighter text-center">
                {modalContent.title}
              </h3>
              <p className="text-[13px] font-bold text-slate-500 text-center leading-relaxed mb-10 max-w-[240px]">
                {modalContent.desc}
              </p>
              
              <button 
                onClick={() => {
                  if (pendingAction.type === 'trip') handleAddTrip();
                  else if (pendingAction.type === 'sheet') handleAddSheet();
                  else if (pendingAction.type === 'flip-direction') handleFlipDirection();
                  else if (pendingAction.type === 'reset-block') handleResetBlock(pendingAction.blockIdx!);
                  else if (pendingAction.type === 'reset-batch') handleResetBatch();
                }} 
                className="w-full bg-primary text-white py-6 rounded-[1.75rem] font-black uppercase tracking-widest text-[14px] shadow-lg shadow-primary/20 active:scale-95 transition-all mb-6"
              >
                {modalContent.confirm}
              </button>
              
              <button 
                onClick={() => setPendingAction(null)} 
                className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors"
              >
                CANCEL
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default TallyScreen;