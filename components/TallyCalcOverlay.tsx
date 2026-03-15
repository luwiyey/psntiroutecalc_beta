import React, { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialInput?: number;
  onApplyTotal?: (value: number) => void;
  onApplyEntries?: (values: number[]) => void;
}

const peso = '\u20B1';
const BACKSPACE = '\u232B';

interface ExpressionSnapshot {
  expression: string;
  caretPos: number;
}

const sanitizeExpression = (value: string) => value.replace(/[^\d+ ]/g, '').replace(/\s{2,}/g, ' ');

const parseEntries = (expression: string) =>
  expression
    .split('+')
    .map(part => part.replace(/\s+/g, ''))
    .filter(Boolean)
    .map(part => parseInt(part, 10))
    .filter(value => !Number.isNaN(value));

const getTokenAtCaret = (expression: string, caretPos: number) => {
  const safeCaret = Math.max(0, Math.min(caretPos, expression.length));
  const start = expression.lastIndexOf('+', safeCaret - 1) + 1;
  const nextPlus = expression.indexOf('+', safeCaret);
  const end = nextPlus === -1 ? expression.length : nextPlus;
  const currentToken = expression.slice(start, end).replace(/\s+/g, '');

  if (currentToken) return currentToken;

  const previousPlus = expression.lastIndexOf('+', Math.max(0, start - 2));
  const fallbackStart = previousPlus === -1 ? 0 : previousPlus + 1;
  return expression.slice(fallbackStart, start).replace(/\s+/g, '');
};

const TallyCalcOverlay: React.FC<Props> = ({
  isOpen,
  onClose,
  initialInput = 0,
  onApplyTotal,
  onApplyEntries
}) => {
  const expressionRef = useRef<HTMLInputElement>(null);
  const [expression, setExpression] = useState('');
  const [caretPos, setCaretPos] = useState(0);
  const [history, setHistory] = useState<ExpressionSnapshot[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const initialExpression = initialInput > 0 ? Math.trunc(initialInput).toString() : '';
    setExpression(initialExpression);
    setCaretPos(initialExpression.length);
    setHistory([]);
  }, [initialInput, isOpen]);

  useEffect(() => {
    if (!isOpen || !expressionRef.current) return;

    const nextPos = Math.min(caretPos, expression.length);
    expressionRef.current.focus();
    expressionRef.current.setSelectionRange(nextPos, nextPos);
  }, [caretPos, expression, isOpen]);

  const entries = useMemo(() => parseEntries(expression), [expression]);
  const runningTotal = useMemo(() => entries.reduce((sum, value) => sum + value, 0), [entries]);
  const blockStart = useMemo(() => (entries.length === 0 ? 0 : Math.floor((entries.length - 1) / 25) * 25), [entries.length]);
  const sheetStart = useMemo(() => (entries.length === 0 ? 0 : Math.floor((entries.length - 1) / 100) * 100), [entries.length]);
  const blockEntries = useMemo(() => entries.slice(blockStart), [blockStart, entries]);
  const sheetEntries = useMemo(() => entries.slice(sheetStart), [entries, sheetStart]);
  const blockTotal = useMemo(() => blockEntries.reduce((sum, value) => sum + value, 0), [blockEntries]);
  const sheetTotal = useMemo(() => sheetEntries.reduce((sum, value) => sum + value, 0), [sheetEntries]);
  const currentToken = useMemo(() => getTokenAtCaret(expression, caretPos) || '0', [caretPos, expression]);

  if (!isOpen) return null;

  const getSelection = () => {
    const start = expressionRef.current?.selectionStart ?? caretPos;
    const end = expressionRef.current?.selectionEnd ?? caretPos;
    return { start, end };
  };

  const saveHistory = () => {
    setHistory(prev => [...prev.slice(-29), { expression, caretPos }]);
  };

  const applyExpression = (nextExpression: string, nextCaret: number) => {
    const sanitized = sanitizeExpression(nextExpression);
    setExpression(sanitized);
    setCaretPos(Math.max(0, Math.min(nextCaret, sanitized.length)));
  };

  const handleSelect = () => {
    const nextPos = expressionRef.current?.selectionStart ?? expression.length;
    setCaretPos(nextPos);
  };

  const handleDigit = (digit: string) => {
    const { start, end } = getSelection();
    const nextExpression = expression.slice(0, start) + digit + expression.slice(end);
    saveHistory();
    applyExpression(nextExpression, start + digit.length);
  };

  const handleBackspace = () => {
    const { start, end } = getSelection();
    if (expression.length === 0) return;

    if (start !== end) {
      saveHistory();
      applyExpression(expression.slice(0, start) + expression.slice(end), start);
      return;
    }

    if (start === 0) return;

    saveHistory();
    applyExpression(expression.slice(0, start - 1) + expression.slice(end), start - 1);
  };

  const handleAdd = () => {
    const { start, end } = getSelection();
    const before = expression.slice(0, start);
    const after = expression.slice(end);
    const trimmedBefore = before.replace(/\s+$/g, '');
    const trimmedAfter = after.replace(/^\s+/g, '');

    if (!/\d$/.test(trimmedBefore)) return;

    const nextAfter = trimmedAfter.startsWith('+') ? trimmedAfter.replace(/^\+\s*/g, '') : trimmedAfter;
    const nextExpression = `${trimmedBefore} + ${nextAfter}`.trimEnd();

    saveHistory();
    applyExpression(nextExpression, trimmedBefore.length + 3);
  };

  const handleUndo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;

      const nextHistory = prev.slice(0, -1);
      const snapshot = prev[prev.length - 1];
      setExpression(snapshot.expression);
      setCaretPos(snapshot.caretPos);
      return nextHistory;
    });
  };

  const handleApplyTotal = () => {
    if (!onApplyTotal || runningTotal <= 0) return;
    onApplyTotal(runningTotal);
    onClose();
  };

  const handleApplyEntries = () => {
    if (!onApplyEntries || entries.length === 0) return;
    onApplyEntries(entries);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[92vh] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-fade-in dark:bg-night-charcoal">
        <div
          className="flex shrink-0 items-center justify-between px-4 pb-2 sm:px-5 sm:pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
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

        <div className="visible-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-5">
          <div className="space-y-2">
            <div className="rounded-[1.75rem] bg-[#0f172a] p-3.5 shadow-inner dark:bg-black sm:rounded-[2rem] sm:p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Current Number</p>

              <div className="mt-2 rounded-[1.5rem] border border-white/10 bg-white/5 px-3.5 py-3">
                <p className="text-[clamp(2.5rem,11vw,3.25rem)] font-900 leading-[0.92] tracking-tight text-white">
                  {currentToken}
                </p>
                <input
                  ref={expressionRef}
                  type="text"
                  inputMode="none"
                  readOnly
                  value={expression}
                  onClick={handleSelect}
                  onKeyUp={handleSelect}
                  onSelect={handleSelect}
                  placeholder="0"
                  className="mt-2 w-full bg-transparent text-[1.05rem] font-black tracking-wide text-slate-400 outline-none placeholder:text-slate-500 caret-white"
                />
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between rounded-[1.25rem] bg-white/5 px-3 py-2.5">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Running Total</p>
                    <p className="mt-1 text-[8px] font-black uppercase tracking-widest text-slate-500">{entries.length} numbers</p>
                  </div>
                  <p className="text-xl font-900 text-white">{peso}{runningTotal}</p>
                </div>

                <div className="flex items-center justify-between rounded-[1.25rem] bg-white/5 px-3 py-2.5">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Per 25 Total</p>
                    <p className="mt-1 text-[8px] font-black uppercase tracking-widest text-slate-500">{blockEntries.length}/25 numbers</p>
                  </div>
                  <p className="text-xl font-900 text-white">{peso}{blockTotal}</p>
                </div>

                <div className="flex items-center justify-between rounded-[1.25rem] bg-white/5 px-3 py-2.5">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Per 100 Total</p>
                    <p className="mt-1 text-[8px] font-black uppercase tracking-widest text-slate-500">{sheetEntries.length}/100 numbers</p>
                  </div>
                  <p className="text-xl font-900 text-white">{peso}{sheetTotal}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleBackspace}
                className="flex h-10 items-center justify-center rounded-[1.25rem] bg-slate-100 text-slate-500 active:scale-95 dark:bg-white/10"
              >
                <span className="text-lg leading-none">{BACKSPACE}</span>
              </button>
              <button
                onClick={handleAdd}
                className="h-10 rounded-[1.25rem] bg-primary text-lg font-black text-white shadow-lg active:scale-95"
              >
                +
              </button>
              <button
                onClick={handleUndo}
                className="h-10 rounded-[1.25rem] bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:bg-white/10"
              >
                Undo
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', '000'].map(key => (
                <button
                  key={key}
                  onClick={() => handleDigit(key)}
                  className="h-12 rounded-[1.25rem] border border-slate-100 bg-white text-2xl font-900 text-slate-900 shadow-sm active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white sm:h-14"
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>

        {(onApplyTotal || onApplyEntries) && (
          <div
            className="shrink-0 border-t border-slate-100 bg-white/95 px-4 pt-2 backdrop-blur dark:border-white/5 dark:bg-night-charcoal/95 sm:px-5"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
          >
            <div className="space-y-2">
              {onApplyEntries && (
                <button
                  onClick={handleApplyEntries}
                  disabled={entries.length === 0}
                  className="w-full rounded-[1.25rem] bg-[#0f172a] py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 disabled:bg-slate-300 dark:disabled:bg-white/10"
                >
                  Add To Tally Sheet
                </button>
              )}
              {onApplyTotal && (
                <button
                  onClick={handleApplyTotal}
                  disabled={runningTotal <= 0}
                  className="w-full rounded-[1.25rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 disabled:bg-slate-300 dark:disabled:bg-white/10"
                >
                  {`Use Total ${peso}${runningTotal}`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TallyCalcOverlay;
