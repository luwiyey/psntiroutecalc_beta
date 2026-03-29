import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BrowserSpeechRecognition } from '../utils/voice';
import {
  cancelVoiceReply,
  extractRecognitionTranscript,
  formatVoiceConfidence,
  getSpeechRecognitionCtor,
  getSpeechRecognitionErrorMessage,
  parseTallyVoiceTranscript,
  parseVoiceBinaryAnswer,
  speakVoiceReply
} from '../utils/voice';

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

interface ThresholdNotice {
  type: 'block' | 'sheet';
  count: number;
  total: number;
}

type VoiceTallyStep = 'expression' | 'confirm-expression';

const sanitizeExpression = (value: string) => value.replace(/[^\d+ ]/g, '').replace(/\s{2,}/g, ' ');

const normalizeExpressionLayout = (value: string) =>
  value
    .replace(/[^\d+ ]/g, '')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*\+\s*/g, '')
    .replace(/\s*\+\s*$/g, '')
    .trim();

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
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const previousEntryCountRef = useRef(0);
  const [expression, setExpression] = useState('');
  const [caretPos, setCaretPos] = useState(0);
  const [history, setHistory] = useState<ExpressionSnapshot[]>([]);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const [voiceStep, setVoiceStep] = useState<VoiceTallyStep>('expression');
  const [pendingVoiceExpression, setPendingVoiceExpression] = useState<{
    expression: string;
    prettyExpression: string;
    entries: number[];
  } | null>(null);
  const [thresholdNotice, setThresholdNotice] = useState<ThresholdNotice | null>(null);
  const [isUndoMenuOpen, setIsUndoMenuOpen] = useState(false);
  const voiceHideTimeoutRef = useRef<number | null>(null);
  const canUseVoiceRecognition = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  useEffect(() => {
    if (!isOpen) return;

    const initialExpression = initialInput > 0 ? Math.trunc(initialInput).toString() : '';
    setExpression(initialExpression);
    setCaretPos(initialExpression.length);
    setHistory([]);
    setIsVoiceListening(false);
    setVoiceTranscript('');
    setVoiceFeedback(null);
    setVoiceConfidence(null);
    setVoiceStep('expression');
    setPendingVoiceExpression(null);
    setThresholdNotice(null);
    setIsUndoMenuOpen(false);
    if (voiceHideTimeoutRef.current) {
      window.clearTimeout(voiceHideTimeoutRef.current);
      voiceHideTimeoutRef.current = null;
    }
    previousEntryCountRef.current = initialExpression ? 1 : 0;
  }, [initialInput, isOpen]);

  useEffect(() => {
    if (!isOpen || !expressionRef.current) return;

    const nextPos = Math.min(caretPos, expression.length);
    expressionRef.current.focus();
    expressionRef.current.setSelectionRange(nextPos, nextPos);
  }, [caretPos, expression, isOpen]);

  useEffect(() => {
    return () => {
      if (voiceHideTimeoutRef.current) {
        window.clearTimeout(voiceHideTimeoutRef.current);
        voiceHideTimeoutRef.current = null;
      }
      voiceRecognitionRef.current?.abort();
      voiceRecognitionRef.current = null;
      cancelVoiceReply();
    };
  }, []);

  const entries = useMemo(() => parseEntries(expression), [expression]);
  const runningTotal = useMemo(() => entries.reduce((sum, value) => sum + value, 0), [entries]);
  const blockStart = useMemo(() => (entries.length === 0 ? 0 : Math.floor((entries.length - 1) / 25) * 25), [entries.length]);
  const sheetStart = useMemo(() => (entries.length === 0 ? 0 : Math.floor((entries.length - 1) / 100) * 100), [entries.length]);
  const blockEntries = useMemo(() => entries.slice(blockStart), [blockStart, entries]);
  const sheetEntries = useMemo(() => entries.slice(sheetStart), [entries, sheetStart]);
  const blockTotal = useMemo(() => blockEntries.reduce((sum, value) => sum + value, 0), [blockEntries]);
  const sheetTotal = useMemo(() => sheetEntries.reduce((sum, value) => sum + value, 0), [sheetEntries]);
  const currentToken = useMemo(() => getTokenAtCaret(expression, caretPos) || '0', [caretPos, expression]);

  useEffect(() => {
    if (!isOpen) return;

    const previousCount = previousEntryCountRef.current;
    if (entries.length > previousCount) {
      if (entries.length % 100 === 0) {
        setThresholdNotice({
          type: 'sheet',
          count: entries.length,
          total: sheetTotal
        });
      } else if (entries.length % 25 === 0) {
        setThresholdNotice({
          type: 'block',
          count: entries.length,
          total: blockTotal
        });
      }
    }

    previousEntryCountRef.current = entries.length;
  }, [blockTotal, entries.length, isOpen, sheetTotal]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (voiceHideTimeoutRef.current) {
      window.clearTimeout(voiceHideTimeoutRef.current);
      voiceHideTimeoutRef.current = null;
    }
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
    cancelVoiceReply();
    setIsVoiceListening(false);
    onClose();
  };

  const clearVoicePanel = () => {
    if (voiceHideTimeoutRef.current) {
      window.clearTimeout(voiceHideTimeoutRef.current);
      voiceHideTimeoutRef.current = null;
    }
    setVoiceTranscript('');
    setVoiceFeedback(null);
    setVoiceConfidence(null);
  };

  const scheduleVoicePanelHide = (delay = 180) => {
    if (voiceHideTimeoutRef.current) {
      window.clearTimeout(voiceHideTimeoutRef.current);
    }
    voiceHideTimeoutRef.current = window.setTimeout(() => {
      clearVoicePanel();
      voiceHideTimeoutRef.current = null;
    }, delay);
  };

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

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextCaret = event.target.selectionStart ?? event.target.value.length;
    applyExpression(event.target.value, nextCaret);
  };

  const handleSelect = () => {
    const nextPos = expressionRef.current?.selectionStart ?? expression.length;
    setCaretPos(nextPos);
  };

  const moveCaret = (delta: number) => {
    const nextPos = Math.max(0, Math.min(caretPos + delta, expression.length));
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

  const handleUndoLastAction = () => {
    handleUndo();
    setIsUndoMenuOpen(false);
  };

  const handleRemoveLastGroup = () => {
    if (entries.length === 0) {
      setIsUndoMenuOpen(false);
      return;
    }

    const nextExpression = entries.slice(0, -1).join(' + ');
    saveHistory();
    applyExpression(nextExpression, nextExpression.length);
    setIsUndoMenuOpen(false);
  };

  const handleRemoveLastNumber = () => {
    const matches = [...expression.matchAll(/\d+/g)];
    const lastMatch = matches[matches.length - 1];
    if (!lastMatch || lastMatch.index === undefined) {
      setIsUndoMenuOpen(false);
      return;
    }

    const nextExpression = normalizeExpressionLayout(
      expression.slice(0, lastMatch.index) + expression.slice(lastMatch.index + lastMatch[0].length)
    );
    saveHistory();
    applyExpression(nextExpression, nextExpression.length);
    setIsUndoMenuOpen(false);
  };

  const handleRemoveCharacter = () => {
    handleBackspace();
    setIsUndoMenuOpen(false);
  };

  const handleClearExpression = () => {
    if (!expression) {
      setIsUndoMenuOpen(false);
      return;
    }

    saveHistory();
    applyExpression('', 0);
    setIsUndoMenuOpen(false);
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

  const beginVoiceTally = (requestedStep: VoiceTallyStep = 'expression') => {
    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setVoiceFeedback('Voice command is not available in this browser. Use Chrome on Android for the best result.');
      return;
    }

    if (voiceHideTimeoutRef.current) {
      window.clearTimeout(voiceHideTimeoutRef.current);
      voiceHideTimeoutRef.current = null;
    }
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceStep(requestedStep);
    setVoiceFeedback(
      requestedStep === 'confirm-expression'
        ? 'Listening... say yes to load the tally now or no to keep speaking.'
        : 'Listening... say something like "657 plus 20 plus 20" or "657 plus n plus n".'
    );

    const recognition = new RecognitionCtor();
    voiceRecognitionRef.current = recognition;
    recognition.lang = 'en-PH';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsVoiceListening(true);
    recognition.onerror = event => {
      setVoiceFeedback(getSpeechRecognitionErrorMessage(event.error));
      setIsVoiceListening(false);
    };
    recognition.onresult = event => {
      const { transcript, confidence } = extractRecognitionTranscript(event);

      setVoiceTranscript(transcript);
      setVoiceConfidence(confidence);

      if (requestedStep === 'confirm-expression') {
        const answer = parseVoiceBinaryAnswer(transcript);
        if (answer === 'yes' && pendingVoiceExpression) {
          saveHistory();
          applyExpression(pendingVoiceExpression.expression, pendingVoiceExpression.expression.length);
          const summary = `Loaded ${pendingVoiceExpression.prettyExpression}. Review it, then tap Add To Tally Sheet when ready.`;
          setPendingVoiceExpression(null);
          setVoiceStep('expression');
          setVoiceFeedback(summary);
          const hidePanel = () => scheduleVoicePanelHide();
          const started = speakVoiceReply(summary, { rate: 1.45, onEnd: hidePanel, onError: hidePanel });
          if (!started) hidePanel();
          return;
        }

        if (answer === 'no') {
          setPendingVoiceExpression(null);
          const retryMessage = 'Okay. Keep speaking the tally now. Say equals if you want me to load it right away.';
          setVoiceFeedback(retryMessage);
          const beginRetry = () => window.setTimeout(() => beginVoiceTally('expression'), 320);
          const started = speakVoiceReply(retryMessage, { rate: 1.45, onEnd: beginRetry, onError: beginRetry });
          if (!started) beginRetry();
          return;
        }

        const nextMessage = 'Please say yes to load the tally now, or say no if you want to keep speaking.';
        setVoiceFeedback(nextMessage);
        const restartConfirm = () => window.setTimeout(() => beginVoiceTally('confirm-expression'), 320);
        const started = speakVoiceReply(nextMessage, { rate: 1.45, onEnd: restartConfirm, onError: restartConfirm });
        if (!started) restartConfirm();
        return;
      }

      const parsed = parseTallyVoiceTranscript(transcript);
      if (parsed.status === 'match') {
        if (!parsed.explicitEquals && parsed.entries.length > 0) {
          setPendingVoiceExpression({
            expression: parsed.expression,
            prettyExpression: parsed.prettyExpression,
            entries: parsed.entries
          });
          const nextMessage = `I heard ${parsed.prettyExpression}. Say yes to load it now or no if you want to keep speaking.`;
          setVoiceFeedback(nextMessage);
          const beginConfirm = () => window.setTimeout(() => beginVoiceTally('confirm-expression'), 320);
          const started = speakVoiceReply(nextMessage, { rate: 1.45, onEnd: beginConfirm, onError: beginConfirm });
          if (!started) beginConfirm();
          return;
        }

        saveHistory();
        applyExpression(parsed.expression, parsed.expression.length);
        setPendingVoiceExpression(null);
        setVoiceStep('expression');
        const summary = `Loaded ${parsed.prettyExpression}. Review it, then tap Add To Tally Sheet when ready.`;
        setVoiceFeedback(summary);
        const hidePanel = () => scheduleVoicePanelHide();
        const started = speakVoiceReply(summary, { rate: 1.45, onEnd: hidePanel, onError: hidePanel });
        if (!started) hidePanel();
        return;
      }

      setPendingVoiceExpression(null);
      setVoiceStep('expression');
      setVoiceFeedback(parsed.message);
      void speakVoiceReply(parsed.message, { rate: 1.45 });
    };
    recognition.onend = () => {
      setIsVoiceListening(false);
      voiceRecognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setVoiceFeedback('Voice recognition could not start. Please try again.');
      setIsVoiceListening(false);
    }
  };

  const startVoiceTally = (requestedStep: VoiceTallyStep = 'expression') => {
    if (isVoiceListening) {
      voiceRecognitionRef.current?.stop();
      clearVoicePanel();
      return;
    }

    cancelVoiceReply();
    if (requestedStep === 'expression') {
      setPendingVoiceExpression(null);
    }
    beginVoiceTally(requestedStep);
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

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

          <div className="flex items-center gap-2">
            <button
              onClick={() => startVoiceTally('expression')}
              disabled={!canUseVoiceRecognition}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-90 ${
                isVoiceListening
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-300'
              } ${!canUseVoiceRecognition ? 'opacity-50' : ''}`}
              title={canUseVoiceRecognition ? 'Voice tally calculator' : 'Voice not available in this browser'}
            >
              <span className="material-icons text-base">{isVoiceListening ? 'graphic_eq' : 'mic'}</span>
            </button>
            <button
              onClick={handleClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 active:scale-90 dark:bg-white/10"
            >
              <span className="material-icons text-base">close</span>
            </button>
          </div>
        </div>

        <div className="visible-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-5">
          <div className="space-y-2">
            <div className="rounded-[1.75rem] bg-[#0f172a] p-3 shadow-inner dark:bg-black sm:rounded-[2rem] sm:p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Current Number</p>

              <div className="mt-2 rounded-[1.5rem] border border-white/10 bg-white/5 px-3 py-2.5">
                <p className="text-[clamp(2.5rem,11vw,3.25rem)] font-900 leading-[0.92] tracking-tight text-white">
                  {currentToken}
                </p>
                <input
                  ref={expressionRef}
                  type="text"
                  inputMode="none"
                  value={expression}
                  onChange={handleInputChange}
                  onClick={handleSelect}
                  onKeyUp={handleSelect}
                  onSelect={handleSelect}
                  placeholder="0"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="mt-2 w-full bg-transparent text-[1.05rem] font-black tracking-wide text-slate-400 outline-none placeholder:text-slate-500 caret-white"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => moveCaret(-1)}
                      disabled={caretPos === 0}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 active:scale-95 disabled:opacity-40"
                      aria-label="Cursor left"
                    >
                      <span className="material-icons text-base">chevron_left</span>
                    </button>
                    <button
                      onClick={() => moveCaret(1)}
                      disabled={caretPos >= expression.length}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 active:scale-95 disabled:opacity-40"
                      aria-label="Cursor right"
                    >
                      <span className="material-icons text-base">chevron_right</span>
                    </button>
                  </div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                    Cursor {Math.min(caretPos + 1, Math.max(expression.length, 1))}/{Math.max(expression.length, 1)}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 space-y-2">
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

            {(voiceFeedback || voiceTranscript || isVoiceListening) && (
              <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-black/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary">Voice Calculator</p>
                    <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                      {voiceTranscript || voiceFeedback}
                    </p>
                    {voiceTranscript && voiceFeedback && voiceFeedback !== voiceTranscript && (
                      <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                        {voiceFeedback}
                      </p>
                    )}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {formatVoiceConfidence(voiceConfidence)}
                  </p>
                </div>
              </div>
            )}

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
                onClick={() => setIsUndoMenuOpen(true)}
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

      {isUndoMenuOpen && (
        <div className="absolute inset-0 z-[145] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setIsUndoMenuOpen(false)} />
          <div className="relative w-full max-w-sm rounded-[2rem] bg-white p-5 shadow-2xl dark:bg-night-charcoal">
            <h3 className="text-base font-900 uppercase tracking-tight text-slate-900 dark:text-white">Choose Undo Action</h3>
            <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-300">
              Pick exactly what you want to remove from the formula so the wrong fare does not disappear by accident.
            </p>

            <div className="mt-4 space-y-2">
              <button
                onClick={handleUndoLastAction}
                className="w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-700 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                Undo Last Action
              </button>
              <button
                onClick={handleRemoveLastGroup}
                className="w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-700 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                Remove Last Added Group
              </button>
              <button
                onClick={handleRemoveLastNumber}
                className="w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-700 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                Remove Last Number
              </button>
              <button
                onClick={handleRemoveCharacter}
                className="w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-700 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                Remove Symbol Or Character At Cursor
              </button>
              <button
                onClick={handleClearExpression}
                className="w-full rounded-[1.25rem] border border-primary/20 bg-primary/5 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-primary active:scale-95 dark:border-primary/30 dark:bg-primary/10"
              >
                Clear Whole Formula
              </button>
            </div>

            <button
              onClick={() => setIsUndoMenuOpen(false)}
              className="mt-4 w-full rounded-[1.25rem] bg-slate-100 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:bg-white/10 dark:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {thresholdNotice && (
        <div className="absolute inset-0 z-[150] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setThresholdNotice(null)} />
          <div className="relative w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-2xl dark:bg-night-charcoal">
            <h3 className="text-lg font-900 uppercase tracking-tight text-slate-900 dark:text-white">
              {thresholdNotice.type === 'sheet' ? '100 Entries Reached' : '25 Entries Reached'}
            </h3>
            <p className="mt-3 text-[11px] font-black uppercase tracking-widest text-slate-500">
              {thresholdNotice.type === 'sheet'
                ? `You now have ${thresholdNotice.count} numbers in this sheet group.`
                : `You now have ${thresholdNotice.count} numbers in this block group.`}
            </p>
            <p className="mt-4 text-3xl font-900 text-primary">{peso}{thresholdNotice.total}</p>
            <button
              onClick={() => setThresholdNotice(null)}
              className="mt-5 w-full rounded-[1.25rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
            >
              Continue
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default TallyCalcOverlay;
