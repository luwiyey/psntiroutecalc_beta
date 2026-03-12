import React, { useEffect, useMemo, useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialInput?: number;
  onApplyTotal?: (value: number) => void;
}

const peso = '\u20B1';

const TallyCalcOverlay: React.FC<Props> = ({
  isOpen,
  onClose,
  initialInput = 0,
  onApplyTotal
}) => {
  const [input, setInput] = useState('0');
  const [entries, setEntries] = useState<number[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const normalizedInitial = initialInput > 0 ? Math.trunc(initialInput) : 0;
    setInput(normalizedInitial > 0 ? normalizedInitial.toString() : '0');
    setEntries([]);
  }, [initialInput, isOpen]);

  const currentValue = useMemo(() => parseInt(input, 10) || 0, [input]);
  const previewEntries = useMemo(
    () => (currentValue > 0 ? [...entries, currentValue] : entries),
    [currentValue, entries]
  );
  const runningTotal = useMemo(
    () => previewEntries.reduce((sum, value) => sum + value, 0),
    [previewEntries]
  );
  const blockStart = useMemo(() => {
    if (previewEntries.length === 0) return 0;
    return Math.floor((previewEntries.length - 1) / 25) * 25;
  }, [previewEntries.length]);
  const sheetStart = useMemo(() => {
    if (previewEntries.length === 0) return 0;
    return Math.floor((previewEntries.length - 1) / 100) * 100;
  }, [previewEntries.length]);
  const blockEntries = useMemo(() => previewEntries.slice(blockStart), [blockStart, previewEntries]);
  const sheetEntries = useMemo(() => previewEntries.slice(sheetStart), [previewEntries, sheetStart]);
  const blockTotal = useMemo(() => blockEntries.reduce((sum, value) => sum + value, 0), [blockEntries]);
  const sheetTotal = useMemo(() => sheetEntries.reduce((sum, value) => sum + value, 0), [sheetEntries]);
  const recentEntries = useMemo(() => entries.slice(-12).reverse(), [entries]);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    setInput(prev => {
      if (prev === '0') return digit;
      if (prev.length >= 4) return prev;
      return prev + digit;
    });
  };

  const handleBackspace = () => {
    setInput(prev => {
      if (prev.length > 1) return prev.slice(0, -1);
      return '0';
    });
  };

  const handleClear = () => {
    setInput('0');
    setEntries([]);
  };

  const handleUndo = () => {
    if (currentValue > 0) {
      setInput('0');
      return;
    }

    setEntries(prev => prev.slice(0, -1));
  };

  const handleAdd = () => {
    if (currentValue <= 0) return;
    setEntries(prev => [...prev, currentValue]);
    setInput('0');
  };

  const handleApply = () => {
    if (!onApplyTotal || runningTotal <= 0) return;
    onApplyTotal(runningTotal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex h-[92vh] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-t-[2.5rem] bg-white shadow-2xl animate-fade-in sm:h-auto sm:max-h-[92vh] sm:rounded-[2.5rem] dark:bg-night-charcoal">
        <div className="shrink-0 flex items-center justify-between px-6 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-md">
              <span className="material-icons text-base">calculate</span>
            </div>
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Tally Calculator</h2>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Addition Only</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 active:scale-90 dark:bg-white/10"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        <div className="shrink-0 px-6 pb-4">
          <div className="rounded-[2rem] bg-[#0f172a] p-5 shadow-inner dark:bg-black">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Current Number</p>
            <p className="mt-2 text-5xl font-900 leading-none tracking-tighter text-white">{peso}{currentValue}</p>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Running Total</span>
                <span className="text-lg font-900 text-white">{peso}{runningTotal}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Per 25 Total</p>
                  <p className="mt-1 text-[8px] font-black uppercase tracking-widest text-slate-500">{blockEntries.length}/25 numbers</p>
                </div>
                <span className="text-base font-900 text-white">{peso}{blockTotal}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Per 100 Total</p>
                  <p className="mt-1 text-[8px] font-black uppercase tracking-widest text-slate-500">{sheetEntries.length}/100 numbers</p>
                </div>
                <span className="text-base font-900 text-white">{peso}{sheetTotal}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4 visible-scrollbar">
          <div className="rounded-[1.75rem] border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-black/30">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Added Numbers</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">{entries.length} saved</p>
            </div>

            {currentValue > 0 && (
              <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-primary">
                Next add: {peso}{currentValue}
              </p>
            )}

            {recentEntries.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {recentEntries.map((entry, index) => (
                  <span
                    key={`${entry}-${index}`}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 dark:border-white/10 dark:bg-night-charcoal dark:text-white"
                  >
                    {peso}{entry}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-300 dark:text-slate-600">
                No numbers added yet
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 px-6 pb-4">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleClear}
              className="h-12 rounded-2xl bg-slate-100 text-[11px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:bg-white/10"
            >
              Clear
            </button>
            <button
              onClick={handleUndo}
              className="h-12 rounded-2xl bg-slate-100 text-[11px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:bg-white/10"
            >
              Undo
            </button>
            <button
              onClick={handleBackspace}
              className="h-12 rounded-2xl bg-slate-100 text-xl font-black text-slate-500 active:scale-95 dark:bg-white/10"
            >
              ⌫
            </button>

            {['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0'].map(key => (
              <button
                key={key}
                onClick={() => handleDigit(key)}
                className="h-14 rounded-2xl border border-slate-100 bg-white text-2xl font-900 text-slate-900 shadow-sm active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                {key}
              </button>
            ))}

            <button
              onClick={handleAdd}
              className="h-14 rounded-2xl bg-primary text-[11px] font-black uppercase tracking-widest text-white shadow-lg active:scale-95"
            >
              Add
            </button>
          </div>
        </div>

        <div className="shrink-0 grid grid-cols-2 gap-3 px-6 pb-6 pt-2">
          <button
            onClick={onClose}
            className="rounded-[1.5rem] bg-slate-100 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:bg-white/10"
          >
            Close
          </button>
          <button
            onClick={handleApply}
            disabled={!onApplyTotal || runningTotal <= 0}
            className="rounded-[1.5rem] bg-primary py-4 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 disabled:bg-slate-300 dark:disabled:bg-white/10"
          >
            {onApplyTotal ? `Use Total ${peso}${runningTotal}` : 'Reference Only'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TallyCalcOverlay;
