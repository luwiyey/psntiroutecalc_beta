import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { TallyTrip, TallySheet } from '../types';

type EditorMode = 'standard' | 'batch';

interface Props {
  onExit?: () => void;
}

const TallyScreen: React.FC<Props> = ({ onExit }) => {
  const { sessions, setSessions, tallyNav, setTallyNav, showToast } = useApp();
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
  
  const [blockAlert, setBlockAlert] = useState<{ completedBlock: number, nextBlock: number } | null>(null);
  const [sheetCompleteAlert, setSheetCompleteAlert] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'trip' | 'sheet' | 'reset-block' | 'flip-direction' | 'reset-batch'; blockIdx?: number } | null>(null);

  const commonFares = [20, 25, 30, 35, 40, 50, 60, 75, 100, 120, 150, 200];
  const allBatchFares = useMemo(() => Array.from({ length: 211 }, (_, i) => i + 16), []);
  
  const filteredBatchFares = useMemo(() => {
    let fares = allBatchFares;

    if (batchSearch) {
      if (batchSearch.includes('-')) {
        const [start, end] = batchSearch.split('-').map(v => parseInt(v.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          fares = fares.filter(f => f >= start && f <= end);
        }
      } else {
        fares = fares.filter(f => f.toString().includes(batchSearch));
      }
    }

    if (showOnlySelected) {
      fares = fares.filter(f => (parseInt(batchCounts[f]) || 0) > 0);
    }

    return fares;
  }, [batchSearch, allBatchFares, showOnlySelected, batchCounts]);

  const blockTotals = useMemo(() => {
    return [0, 1, 2, 3].map(blockIdx => {
      const slice = activeSheet.slots.slice(blockIdx * 25, (blockIdx + 1) * 25);
      return slice.reduce((a, b) => a + b, 0);
    });
  }, [activeSheet]);

  const blockCounts = useMemo(() => {
    return [0, 1, 2, 3].map(blockIdx => {
      const slice = activeSheet.slots.slice(blockIdx * 25, (blockIdx + 1) * 25);
      return slice.filter(v => v > 0).length;
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
  
  const currentTargetSlot = selectedSlotIdx + stagedStandardEntries.length;
  const currentBlockIdx = Math.floor(currentTargetSlot / 25);

  const handleAddTrip = () => {
    const lastTrip = activeSession.trips[activeSession.trips.length - 1];
    const nextDir = lastTrip.direction === 'north' ? 'south' : 'north';
    const nextTripNum = activeSession.trips.length + 1;
    const newTrip: TallyTrip = {
      id: `trip-${Date.now()}`,
      name: `Trip ${nextTripNum}`,
      direction: nextDir,
      sheets: [{ id: `sheet-${Date.now()}`, slots: Array(100).fill(0), status: 'in-progress', lastUpdatedAt: Date.now() }]
    };
    setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, trips: [...s.trips, newTrip] } : s));
    setTallyNav(n => ({ ...n, tripIdx: activeSession.trips.length, sheetIdx: 0, blockIdx: 0 }));
    setPendingAction(null);
    showToast(`Trip ${nextTripNum} set to ${nextDir === 'north' ? 'Baguio' : 'Bayambang'}`);
  };

  const handleAddSheet = () => {
    const newSheet: TallySheet = { id: `sheet-${Date.now()}`, slots: Array(100).fill(0), status: 'in-progress', lastUpdatedAt: Date.now() };
    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s, trips: s.trips.map((t, ti) => ti === tallyNav.tripIdx ? { ...t, sheets: [...t.sheets, newSheet] } : t)
    } : s));
    const newSheetIdx = activeTrip.sheets.length;
    setTallyNav(n => ({ ...n, sheetIdx: newSheetIdx, blockIdx: 0 }));
    setSelectedSlotIdx(0);
    setStagedStandardEntries([]);
    setEditValue('');
    setBatchCounts({});
    setPendingAction(null);
    showToast(`Sheet ${newSheetIdx + 1} added`);
  };

  const handleFlipDirection = () => {
    const nextDir = activeTrip.direction === 'north' ? 'south' : 'north';
    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s, trips: s.trips.map((t, ti) => ti === tallyNav.tripIdx ? { ...t, direction: nextDir } : t)
    } : s));
    setPendingAction(null);
    showToast(`Heading to ${nextDir === 'north' ? 'Baguio' : 'Bayambang'}`, 'info');
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
    showToast(`Block B${bIdx + 1} cleared`);
  };

  const handleSlotClick = (idx: number) => {
    if (activeSheet.status === 'recorded' || activeSession.status === 'closed') return;
    setSelectedSlotIdx(idx);
    setStagedStandardEntries([]);
    setEditValue('');
    setBatchCounts({});
    setBatchSearch('');
    setShowOnlySelected(false);
    setIsFlashing(false);
    setLastPunched(null);
    setIsEditorOpen(true);
    setBlockAlert(null);
    setSheetCompleteAlert(false);
    setIsFooterCollapsed(true);
  };

  const commitStandardEntry = (val: number, isTileClick = false) => {
    if (isNaN(val) || val <= 0) return;
    const newTapeLength = stagedStandardEntries.length + 1;
    const absoluteSlot = selectedSlotIdx + newTapeLength;
    setLastPunched(val);
    setIsFlashing(true);
    setStagedStandardEntries(prev => [...prev, val]);
    setEditValue('');
    if (absoluteSlot === 100) setSheetCompleteAlert(true);
    else if (absoluteSlot % 25 === 0) {
      setBlockAlert({ completedBlock: Math.floor(absoluteSlot / 25), nextBlock: Math.floor(absoluteSlot / 25) + 1 });
    }
    setTimeout(() => setIsFlashing(false), 150);
    if (isTileClick) {
      inputRef.current?.blur();
    } else {
      inputRef.current?.focus();
    }
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
    showToast(`Waybill Updated: Recorded ${finalEntries.length} items`);
  };

  const getTapeHighlight = (slotNum: number) => {
    const blockIdx = Math.floor((slotNum - 1) / 25);
    switch(blockIdx) {
      case 0: return 'bg-red-50 border-red-100 text-red-700 dark:bg-red-900/20 dark:border-red-700/50 dark:text-red-300';
      case 1: return 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700/50 dark:text-emerald-300';
      case 2: return 'bg-blue-50 border-blue-100 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700/50 dark:text-blue-300';
      case 3: return 'bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-300';
      default: return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

  const handleResetBatch = () => {
    if (Object.keys(batchCounts).length === 0 && !batchSearch && !showOnlySelected) return;
    setPendingAction({ type: 'reset-batch' });
  };

  const confirmResetBatch = () => {
    setBatchCounts({});
    setBatchSearch('');
    setShowOnlySelected(false);
    setPendingAction(null);
    showToast('Batch entries cleared', 'info');
  };

  const handleProceedToNextSheet = () => {
    handleConfirmAll();
    handleAddSheet();
    setSheetCompleteAlert(false);
  };

  return (
    <div className="flex flex-col min-h-full bg-slate-50 dark:bg-black transition-all overflow-hidden">
      <header className="shrink-0 bg-primary flex items-center justify-between px-6 py-4 shadow-md sticky top-0 z-40 h-[72px]">
        <div className="flex items-center gap-3">
          <span className="material-icons text-white text-2xl">fact_check</span>
          <h1 className="text-xl font-medium text-white tracking-tight">Tally Sheet</h1>
        </div>
        <button 
          onClick={onExit}
          className="bg-white/10 hover:bg-white/20 text-white w-12 h-12 rounded-2xl transition-colors flex items-center justify-center border border-white/10"
        >
          <span className="material-icons text-2xl leading-none">close</span>
        </button>
      </header>

      {/* Waybill Main Tally Grid Headers */}
      <div className="sticky top-[72px] z-30 bg-white dark:bg-night-charcoal border-b dark:border-white/10 shadow-sm h-auto shrink-0">
        <div className="flex bg-slate-100 dark:bg-black/40 h-auto items-center">
          <div className="flex flex-1 overflow-x-auto scrollbar-hide">
            {activeSession.trips.map((t, i) => (
              <button key={t.id} onClick={() => setTallyNav(n => ({ ...n, tripIdx: i, sheetIdx: 0, blockIdx: 0 }))} 
                className={`flex-shrink-0 px-8 py-4 border-b-2 transition-all ${tallyNav.tripIdx === i ? 'bg-white dark:bg-night-charcoal border-primary text-primary' : 'border-transparent text-slate-400'}`}>
                <span className="font-900 uppercase text-[11px] tracking-[0.1em]">{t.name}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setPendingAction({ type: 'trip' })} className="w-16 h-12 flex items-center justify-center text-primary active:scale-90 transition-transform">
             <span className="material-icons text-2xl">add_circle</span>
          </button>
        </div>
        <div className="flex bg-white dark:bg-night-charcoal h-auto items-center border-t border-slate-100 dark:border-white/5">
          <div className="flex flex-1 overflow-x-auto scrollbar-hide">
            {activeTrip.sheets.map((s, i) => (
              <button key={s.id} onClick={() => setTallyNav(n => ({ ...n, sheetIdx: i, blockIdx: 0 }))} 
                className={`flex-shrink-0 min-w-[90px] py-3.5 border-b-2 transition-all flex flex-col items-center justify-center ${tallyNav.sheetIdx === i ? 'border-primary text-primary bg-white dark:bg-white/5' : 'border-transparent text-slate-300'}`}>
                <span className="font-900 uppercase text-[10px] tracking-wider leading-none">Sheet {i + 1}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setPendingAction({ type: 'sheet' })} className="w-16 h-12 flex items-center justify-center text-slate-300 active:text-primary transition-colors">
             <span className="material-icons text-2xl">add</span>
          </button>
        </div>
        <div className="px-4 py-2.5 bg-white dark:bg-night-charcoal flex items-center justify-between h-auto border-t border-slate-50 dark:border-white/5">
           <button onClick={() => setPendingAction({ type: 'flip-direction' })} className="flex items-center gap-3 active:scale-95 transition-transform bg-slate-50 dark:bg-white/5 px-4 py-1.5 rounded-xl border border-slate-100 dark:border-white/5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${activeTrip.direction === 'north' ? 'bg-primary text-white' : 'bg-slate-800 text-white'}`}>
                <span className="material-icons text-xs">{activeTrip.direction === 'north' ? 'north' : 'south'}</span>
              </div>
              <div className="text-left">
                <p className="text-[6px] font-black uppercase text-slate-400 leading-none mb-0.5">Heading</p>
                <span className="font-black uppercase text-[10px] tracking-tight text-slate-900 dark:text-white leading-none">{activeTrip.direction === 'north' ? 'Baguio' : 'Bayambang'}</span>
              </div>
           </button>
           <div className="text-right">
             <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Sheet Total</p>
             <p className="text-xl font-900 text-primary leading-none">₱{sheetTotal}</p>
          </div>
        </div>
        <div className="flex p-2 gap-2 bg-slate-100 dark:bg-black/20 h-auto border-t border-slate-200 dark:border-white/10">
          {[0, 1, 2, 3].map(b => (
            <div key={b} className="flex-1 flex flex-col items-stretch">
               <button onClick={() => setTallyNav(n => ({ ...n, blockIdx: b }))}
                 className={`w-full py-2 rounded-xl font-black border flex flex-col items-center justify-center transition-all ${tallyNav.blockIdx === b ? 'bg-white dark:bg-night-charcoal border-primary/20 text-primary shadow-sm' : 'bg-transparent border-transparent text-slate-400'}`}>
                 <span className="text-[8px] opacity-60 uppercase tracking-tighter">Block {b + 1} ({blockCounts[b]}/25)</span>
                 <span className="text-[9px]">₱{blockTotals[b]}</span>
               </button>
                <button onClick={() => setPendingAction({ type: 'reset-block', blockIdx: b })} className="flex items-center justify-center gap-1 text-slate-400 hover:text-red-500 mt-1 transition-colors">
                  <span className="material-icons text-xs">refresh</span>
                  <span className="text-[8px] font-bold uppercase tracking-wider">reset</span>
                </button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 grid grid-cols-5 gap-3.5 flex-1 overflow-y-auto pb-24">
        {activeSheet.slots.slice(tallyNav.blockIdx * 25, (tallyNav.blockIdx + 1) * 25).map((val, i) => {
          const idx = tallyNav.blockIdx * 25 + i;
          return (
            <button key={idx} onClick={() => handleSlotClick(idx)}
              className={`aspect-square rounded-[1.25rem] border flex flex-col items-center justify-center relative transition-all ${val > 0 ? 'bg-primary border-primary text-white shadow-md' : 'bg-white dark:bg-night-charcoal border-slate-200 dark:border-white/10 text-slate-300 hover:border-primary/40'}`}>
              <span className="font-black opacity-30 absolute top-2 left-2 text-[7px]">{idx + 1}</span>
              <span className="font-900 text-lg leading-none">{val || '—'}</span>
            </button>
          );
        })}
      </div>

      {isEditorOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setIsEditorOpen(false)} />
          
          <div className="relative bg-white dark:bg-night-charcoal rounded-t-[3.5rem] shadow-2xl h-full mt-2 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            <input 
              ref={inputRef} 
              type="number" 
              inputMode="numeric" 
              className="absolute top-0 opacity-0 pointer-events-none" 
              value={editValue} 
              onChange={e => setEditValue(e.target.value)} 
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitStandardEntry(parseInt(editValue) || 0); } }} 
            />

            {/* MODAL HEADER */}
            <div className="shrink-0 flex items-center justify-between px-8 pt-8 pb-4">
               <h1 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Waybill Entry</h1>
               <button onClick={() => setIsEditorOpen(false)} className="bg-slate-100 dark:bg-white/10 p-2 rounded-full"><span className="material-icons text-slate-600 dark:text-white text-lg">close</span></button>
            </div>

            {/* SUMMARY STATS & PUNCH DISPLAY (FIXED) */}
            <div className="shrink-0 px-8 pb-4">
              <div className="flex gap-2 mb-4">
                <div className="flex-1 bg-slate-50 dark:bg-black/30 p-3 rounded-2xl border border-slate-100 dark:border-white/5">
                  <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{activeTrip.direction === 'north' ? 'BAGUIO' : 'BAYAMBANG'} {activeTrip.name.toUpperCase()}</p>
                  <h2 className="text-[11px] font-900 text-slate-800 dark:text-white uppercase leading-none">S{tallyNav.sheetIdx + 1} B{currentBlockIdx + 1} SLOT {currentTargetSlot + 1}</h2>
                </div>
                <div className="flex-1 bg-zinc-900 dark:bg-black p-3 rounded-2xl border-b-[2px] border-black/50 shadow-lg">
                  <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Gross</p>
                  <p className="text-lg font-900 text-white leading-none">₱{grandTotalInEditor}</p>
                </div>
              </div>

              <button 
                onClick={() => inputRef.current?.focus()} 
                className={`w-full rounded-[2rem] py-4 border-2 flex flex-col items-center justify-center transition-all relative active:scale-95 ${isFlashing ? 'bg-neon-green/10 border-neon-green shadow-lg' : 'bg-slate-50 dark:bg-black/40 border-slate-100 dark:border-white/5 shadow-inner'}`}
              >
                <p className="text-[7px] font-black uppercase tracking-widest mb-1 text-slate-400">{editorMode === 'batch' ? 'Batch Mode Total' : 'Punch Amount'}</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-900 text-slate-400 leading-none">₱</span>
                  <h3 className={`text-3xl font-900 leading-none transition-colors ${isFlashing ? 'text-neon-green' : (editValue ? 'text-primary' : 'text-slate-900 dark:text-white')}`}>
                    {editorMode === 'batch' ? batchTotalGross : (isFlashing ? lastPunched : (editValue || '0'))}
                  </h3>
                </div>
              </button>

              <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-full mt-4 border dark:border-white/5">
                <button onClick={() => setEditorMode('standard')} className={`flex-1 py-2.5 rounded-full font-black uppercase text-[9px] tracking-widest transition-all ${editorMode === 'standard' ? 'bg-white dark:bg-night-charcoal text-primary shadow-sm' : 'text-slate-400'}`}>Standard</button>
                <button onClick={() => setEditorMode('batch')} className={`flex-1 py-2.5 rounded-full font-black uppercase text-[9px] tracking-widest transition-all ${editorMode === 'batch' ? 'bg-white dark:bg-night-charcoal text-primary shadow-sm' : 'text-slate-400'}`}>Batch Mode</button>
              </div>
            </div>

            {/* DYNAMIC SCROLLABLE BODY */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-8">
              {editorMode === 'standard' ? (
                <div className="flex-1 overflow-y-auto pb-4">
                  {stagedStandardEntries.length > 0 && (
                    <div className="w-full bg-slate-50 dark:bg-black/20 p-3 rounded-2xl border dark:border-white/5 mb-4 shrink-0">
                      <div className="flex justify-between items-center mb-2 px-1">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Entry Tape</p>
                        <button onClick={() => setStagedStandardEntries([])} className="text-[7px] font-black uppercase text-primary">Clear</button>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5 max-h-[80px] overflow-y-auto visible-scrollbar">
                        {stagedStandardEntries.map((fare, i) => (
                          <div key={i} className={`h-8 rounded-lg flex flex-col items-center justify-center border text-[9px] font-black shadow-sm ${getTapeHighlight(selectedSlotIdx + i + 1)}`}>
                            ₱{fare}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2.5">
                    {commonFares.map(f => (
                      <button key={f} onClick={() => commitStandardEntry(f, true)} className="aspect-square bg-primary text-white rounded-[1.5rem] font-black text-2xl shadow-md active:scale-90 transition-transform">
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* BATCH SEARCH BAR & ACTIONS */}
                  <div className="shrink-0 space-y-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                        <input 
                          type="number" inputMode="numeric" 
                          placeholder="Search..." 
                          className="w-full pl-8 pr-7 py-2.5 bg-slate-50 dark:bg-white/5 border-2 border-slate-100 dark:border-white/5 rounded-xl font-black text-[11px] outline-none focus:border-primary"
                          value={batchSearch}
                          onChange={(e) => setBatchSearch(e.target.value)}
                        />
                        {batchSearch && <button onClick={() => setBatchSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><span className="material-icons text-xs">close</span></button>}
                      </div>
                      
                      {/* VIEW ONLY SELECTED TOGGLE */}
                      <button 
                        onClick={() => setShowOnlySelected(!showOnlySelected)}
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${showOnlySelected ? 'bg-primary border-primary text-white shadow-lg scale-105' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-400'}`}
                        title="Show selected only"
                      >
                        <span className="material-icons text-lg">{showOnlySelected ? 'visibility' : 'visibility_off'}</span>
                      </button>

                      {/* RESET ALL COUNTS */}
                      <button 
                        onClick={handleResetBatch}
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-90 transition-all ${Object.keys(batchCounts).length > 0 ? 'bg-white dark:bg-white/10 border-primary/20 text-primary shadow-sm' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-400'}`}
                        title="Clear all counts"
                      >
                        <span className="material-icons text-lg">refresh</span>
                      </button>
                    </div>

                    <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                      {['ALL', '16-39', '40-79', '80-149', '150+'].map(label => {
                        const val = label === 'ALL' ? '' : (label === '150+' ? '150-226' : label);
                        return (
                          <button key={label} onClick={() => setBatchSearch(val)} className={`px-3 py-1.5 rounded-full font-black text-[7px] uppercase tracking-widest border whitespace-nowrap ${batchSearch === val ? 'bg-primary border-primary text-white' : 'bg-white dark:bg-night-charcoal border-slate-200 dark:border-white/5 text-slate-400'}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* FARE LIST */}
                  <div className="flex-1 overflow-y-auto visible-scrollbar pr-1 mb-2" ref={scrollContainerRef}>
                    <div className="divide-y dark:divide-white/5">
                      {filteredBatchFares.length > 0 ? (
                        filteredBatchFares.map(f => (
                          <div key={f} className={`flex items-center justify-between py-2.5 transition-colors ${batchCounts[f] ? 'bg-primary/5 -mx-1 px-1 rounded-xl' : ''}`}>
                            <div className="flex items-center gap-2">
                              <p className={`font-900 ${batchCounts[f] ? 'text-primary text-lg' : 'text-sm text-slate-800 dark:text-white'}`}>₱{f}</p>
                              {batchCounts[f] && <span className="w-1 h-1 rounded-full bg-neon-green shadow-sm animate-pulse"></span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setBatchCounts(p => ({...p, [f]: Math.max(0, parseInt(p[f] || '0') - 1).toString()}))} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center active:scale-90 transition-transform"><span className="material-icons text-xs">remove</span></button>
                              <input type="number" inputMode="numeric" className="w-12 h-8 bg-white dark:bg-black border rounded-lg text-center font-900 text-sm" value={batchCounts[f] || ''} placeholder="0" onChange={e => setBatchCounts(p => ({...p, [f]: e.target.value}))} />
                              <button onClick={() => setBatchCounts(p => ({...p, [f]: (parseInt(p[f] || '0') + 1).toString()}))} className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center active:scale-90 transition-transform"><span className="material-icons text-xs">add</span></button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-10 text-center opacity-30 text-[10px] font-black uppercase">
                          <span className="material-icons block text-3xl mb-2">search_off</span>
                          {showOnlySelected ? 'No selected fares to show' : 'No fares found'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* COLLAPSIBLE FOOTER */}
            <div className={`shrink-0 bg-white dark:bg-night-charcoal border-t dark:border-white/10 transition-all duration-300 overflow-hidden ${isFooterCollapsed ? 'max-h-[70px]' : 'max-h-[300px]'}`}>
               {/* MINIMIZED BAR */}
               {isFooterCollapsed ? (
                 <div 
                   onClick={() => setIsFooterCollapsed(false)}
                   className="flex items-center justify-between px-8 py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                 >
                   <div className="flex items-center gap-2">
                     <span className="material-icons text-emerald-500 text-sm">check_circle</span>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Finalize Session</p>
                   </div>
                   <div className="flex items-center gap-4">
                     <p className="text-xl font-900 text-primary">₱{grandTotalInEditor}</p>
                     <span className="material-icons text-slate-400">expand_less</span>
                   </div>
                 </div>
               ) : (
                 <div className="px-8 pt-4 pb-10">
                   <div className="flex items-center justify-between mb-4">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Final Audit Review</p>
                     <button onClick={() => setIsFooterCollapsed(true)} className="p-1"><span className="material-icons text-slate-400">expand_more</span></button>
                   </div>
                   <button 
                     onClick={handleConfirmAll} 
                     disabled={grandTotalInEditor === 0} 
                     className="w-full bg-primary text-white py-4 rounded-[1.5rem] font-black uppercase text-[10px] shadow-lg active:scale-95 border-b-[4px] border-black/20 flex items-center justify-center gap-2"
                   >
                     Finalize Waybill ₱{grandTotalInEditor}
                     <span className="material-icons text-sm">check_circle</span>
                   </button>
                 </div>
               )}
            </div>

            {/* OVERLAY ALERTS */}
            {blockAlert && (
              <div className="absolute inset-0 z-[110] flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm">
                <div className="bg-white dark:bg-night-charcoal rounded-[2.5rem] p-8 w-full shadow-2xl text-center border-t-8 border-primary">
                   <h3 className="text-lg font-900 text-slate-800 dark:text-white mb-2 uppercase tracking-tighter">BLOCK {blockAlert.completedBlock} COMPLETE</h3>
                   <div className="space-y-2 mt-6">
                      <button onClick={() => { setTallyNav(prev => ({ ...prev, blockIdx: blockAlert.nextBlock - 1 })); setBlockAlert(null); }} className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase text-[10px]">Continue to Block {blockAlert.nextBlock}</button>
                      <button onClick={() => setBlockAlert(null)} className="w-full py-3 text-slate-400 font-black uppercase text-[9px]">Review Current Block</button>
                   </div>
                </div>
              </div>
            )}

            {sheetCompleteAlert && (
              <div className="absolute inset-0 z-[120] flex items-center justify-center p-8 bg-black/80 backdrop-blur-md">
                <div className="bg-white dark:bg-night-charcoal rounded-[2.5rem] p-8 w-full shadow-2xl text-center border-t-8 border-primary">
                   <h3 className="text-lg font-900 text-slate-800 dark:text-white mb-2 uppercase font-bold">SHEET COMPLETE</h3>
                   <div className="space-y-2 mt-6">
                      <button onClick={handleProceedToNextSheet} className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase text-[10px]">Start Sheet {tallyNav.sheetIdx + 2}</button>
                      <button onClick={() => { setSheetCompleteAlert(false); setIsEditorOpen(false); }} className="w-full py-3 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 rounded-xl font-black uppercase text-[9px]">Finish & Close</button>
                   </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {pendingAction && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-8">
           <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setPendingAction(null)} />
           <div className="relative bg-white dark:bg-night-charcoal rounded-[2.5rem] p-8 w-full shadow-2xl text-center">
              <h3 className="text-lg font-900 text-slate-800 dark:text-white mb-6 uppercase">
                {pendingAction.type === 'reset-batch' ? 'Clear Batch Entries?' :
                 pendingAction.type === 'reset-block' ? `Reset Block ${pendingAction.blockIdx! + 1}?` :
                 'Confirm Action'}
              </h3>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 -mt-4">
                {pendingAction.type === 'reset-batch' ? 'This will reset all current ticket counts to zero.' :
                 pendingAction.type === 'reset-block' ? 'All 25 slots in this block will be cleared. This action cannot be undone.' :
                 'Are you sure you want to proceed?'}
              </p>
              <div className="space-y-2">
                 <button onClick={() => {
                     if (pendingAction.type === 'trip') handleAddTrip();
                     else if (pendingAction.type === 'sheet') handleAddSheet();
                     else if (pendingAction.type === 'flip-direction') handleFlipDirection();
                     else if (pendingAction.type === 'reset-block') handleResetBlock(pendingAction.blockIdx!);
                     else if (pendingAction.type === 'reset-batch') confirmResetBatch();
                   }} className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest text-[10px]">Confirm</button>
                 <button onClick={() => setPendingAction(null)} className="w-full py-3 text-slate-400 font-black uppercase text-[9px]">Cancel</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default TallyScreen;
