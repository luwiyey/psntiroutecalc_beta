import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BrowserSpeechRecognition } from '../utils/voice';
import {
  cancelVoiceReply,
  extractRecognitionTranscript,
  formatVoiceConfidence,
  getSpeechRecognitionCtor,
  getSpeechRecognitionErrorMessage,
  parseCalculatorVoiceTranscript,
  parseCashVoiceTranscript,
  parseVoiceBinaryAnswer,
  speakVoiceReply
} from '../utils/voice';

export interface VoiceChangePreset {
  fareAmount: number;
  cashAmount: number;
  changeAmount: number;
  summary: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialValue: number;
  title?: string;
  showQuickBills?: boolean;
  assistantPreset?: VoiceChangePreset | null;
}

type Operator = '+' | '-' | '*' | '/';

type Token =
  | { type: 'number'; raw: string; value: number }
  | { type: 'operator'; op: Operator };

type AstNode =
  | { type: 'number'; raw: string; value: number }
  | { type: 'binary'; op: Operator; left: AstNode; right: AstNode };

type VoiceCalculatorStep = 'expression' | 'confirm-expression';

const precedence: Record<Operator, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2
};

const MULTIPLY = '\u00D7';
const DIVIDE = '\u00F7';
const BACKSPACE = '\u232B';
const peso = '\u20B1';

const isOperator = (value: string): value is Operator => ['+', '-', '*', '/'].includes(value);
const isNumericChar = (value: string) => /[\d.]/.test(value);

const normalizeExpression = (value: string) =>
  value
    .replace(/\s+/g, '')
    .replace(new RegExp(MULTIPLY, 'g'), '*')
    .replace(new RegExp(DIVIDE, 'g'), '/')
    .replace(/[^0-9.+\-*/]/g, '');

const displayExpression = (value: string) =>
  value.replace(/\*/g, MULTIPLY).replace(/\//g, DIVIDE);

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return 'Error';
  if (Number.isInteger(value)) return value.toString();
  return Number(value.toFixed(10)).toString();
};

const tokenizeExpression = (expression: string): Token[] | null => {
  if (!expression) return null;

  const tokens: Token[] = [];
  let index = 0;
  let expectNumber = true;

  while (index < expression.length) {
    const char = expression[index];

    if (expectNumber) {
      const start = index;
      if (char === '-') index += 1;

      let hasDigit = false;
      let hasDot = false;

      while (index < expression.length) {
        const current = expression[index];
        if (current === '.') {
          if (hasDot) return null;
          hasDot = true;
          index += 1;
          continue;
        }

        if (!/\d/.test(current)) break;
        hasDigit = true;
        index += 1;
      }

      if (!hasDigit) return null;

      const raw = expression.slice(start, index);
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;

      tokens.push({ type: 'number', raw, value });
      expectNumber = false;
      continue;
    }

    if (!isOperator(char)) return null;
    tokens.push({ type: 'operator', op: char });
    index += 1;
    expectNumber = true;
  }

  return expectNumber ? null : tokens;
};

const buildAst = (tokens: Token[]): AstNode | null => {
  const nodeStack: AstNode[] = [];
  const opStack: Operator[] = [];

  const reduce = () => {
    const op = opStack.pop();
    const right = nodeStack.pop();
    const left = nodeStack.pop();

    if (!op || !left || !right) return false;

    nodeStack.push({ type: 'binary', op, left, right });
    return true;
  };

  for (const token of tokens) {
    if (token.type === 'number') {
      nodeStack.push({ type: 'number', raw: token.raw, value: token.value });
      continue;
    }

    while (opStack.length > 0 && precedence[opStack[opStack.length - 1]] >= precedence[token.op]) {
      if (!reduce()) return null;
    }
    opStack.push(token.op);
  }

  while (opStack.length > 0) {
    if (!reduce()) return null;
  }

  return nodeStack.length === 1 ? nodeStack[0] : null;
};

const evaluateAst = (node: AstNode): number => {
  if (node.type === 'number') return node.value;

  const left = evaluateAst(node.left);
  const right = evaluateAst(node.right);

  switch (node.op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      if (right === 0) throw new Error('Division by zero');
      return left / right;
  }
};

const stringifyAst = (node: AstNode): string => {
  if (node.type === 'number') return formatNumber(node.value);

  const leftText = stringifyAst(node.left);
  const rightText = stringifyAst(node.right);

  const wrapChild = (child: AstNode, childText: string, childIsRight: boolean) => {
    if (child.type === 'number') return childText;

    const parentPrec = precedence[node.op];
    const childPrec = precedence[child.op];
    const needsWrap = childPrec !== parentPrec || (childIsRight && (node.op === '-' || node.op === '/'));

    return needsWrap ? `(${childText})` : childText;
  };

  return `${wrapChild(node.left, leftText, false)} ${displayExpression(node.op)} ${wrapChild(node.right, rightText, true)}`;
};

const findEvaluableExpression = (expression: string) => {
  let candidate = normalizeExpression(expression);

  while (candidate) {
    const tokens = tokenizeExpression(candidate);
    if (tokens) {
      const ast = buildAst(tokens);
      if (ast) {
        try {
          return {
            result: evaluateAst(ast),
            pretty: stringifyAst(ast)
          };
        } catch {
          return null;
        }
      }
    }

    candidate = candidate.slice(0, -1);
  }

  return null;
};

const ConductorCalcOverlay: React.FC<Props> = ({
  isOpen,
  onClose,
  initialValue,
  title = 'Conductor Calc',
  showQuickBills = true,
  assistantPreset = null
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [expression, setExpression] = useState('');
  const [caretPos, setCaretPos] = useState(0);
  const [lastFormula, setLastFormula] = useState('');
  const [hasEvaluated, setHasEvaluated] = useState(false);
  const [displaySource, setDisplaySource] = useState<'manual' | 'change'>('manual');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const [voiceStep, setVoiceStep] = useState<VoiceCalculatorStep>('expression');
  const [pendingVoiceExpression, setPendingVoiceExpression] = useState<{
    expression: string;
    prettyExpression: string;
    resultText: string;
    usesPemdas: boolean;
  } | null>(null);
  const voiceHideTimeoutRef = useRef<number | null>(null);
  const canUseVoiceRecognition = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  const baseFareDue = assistantPreset?.fareAmount ?? initialValue;
  const preview = useMemo(() => findEvaluableExpression(expression), [expression]);
  const previewResult = preview ? formatNumber(preview.result) : '0';
  const formulaLine = hasEvaluated && lastFormula ? `${lastFormula} =` : (preview?.pretty || '');
  const quickBills = [20, 50, 100, 200, 500, 1000];

  useEffect(() => {
    if (!isOpen) return;

    setIsVoiceListening(false);
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceStep('expression');
    setPendingVoiceExpression(null);
    if (voiceHideTimeoutRef.current) {
      window.clearTimeout(voiceHideTimeoutRef.current);
      voiceHideTimeoutRef.current = null;
    }

    if (assistantPreset) {
      const result = formatNumber(assistantPreset.changeAmount);
      setExpression(result);
      setCaretPos(result.length);
      setLastFormula(`${formatNumber(assistantPreset.cashAmount)} - ${formatNumber(assistantPreset.fareAmount)}`);
      setHasEvaluated(true);
      setDisplaySource('change');
      setVoiceFeedback(null);
      return;
    }

    setExpression('');
    setCaretPos(0);
    setLastFormula('');
    setHasEvaluated(false);
    setDisplaySource('manual');
    setVoiceFeedback(null);
  }, [assistantPreset, baseFareDue, isOpen]);

  useEffect(() => {
    if (!isOpen || !inputRef.current) return;
    const nextPos = Math.min(caretPos, expression.length);
    inputRef.current.focus();
    inputRef.current.setSelectionRange(nextPos, nextPos);
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

  const getSelection = () => ({
    start: inputRef.current?.selectionStart ?? caretPos,
    end: inputRef.current?.selectionEnd ?? caretPos
  });

  const updateExpression = (nextValue: string, nextCaret: number, preserveFormula = false) => {
    const normalized = normalizeExpression(nextValue);
    setExpression(normalized);
    setCaretPos(Math.min(nextCaret, normalized.length));
    setHasEvaluated(false);
    setDisplaySource('manual');
    if (!preserveFormula) setLastFormula('');
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextCaret = event.target.selectionStart ?? event.target.value.length;
    updateExpression(event.target.value, nextCaret);
  };

  const handleSelect = () => {
    const nextPos = inputRef.current?.selectionStart ?? expression.length;
    setCaretPos(nextPos);
  };

  const moveCaret = (delta: number) => {
    const nextPos = Math.max(0, Math.min(caretPos + delta, expression.length));
    setCaretPos(nextPos);
  };

  const insertValue = (value: string, clearOnEvaluated = false) => {
    const base = clearOnEvaluated && hasEvaluated ? '' : expression;
    const { start, end } = getSelection();
    const nextValue = base.slice(0, start) + value + base.slice(end);
    updateExpression(nextValue, start + value.length);
  };

  const handleDigit = (digit: string) => insertValue(digit, true);

  const handleOperator = (operator: Operator) => {
    if (hasEvaluated) {
      updateExpression(previewResult + operator, previewResult.length + 1, true);
      return;
    }

    insertValue(operator);
  };

  const handleBackspace = () => {
    const { start, end } = getSelection();
    if (start === 0 && end === 0) return;

    const nextValue =
      start !== end
        ? expression.slice(0, start) + expression.slice(end)
        : expression.slice(0, start - 1) + expression.slice(end);

    updateExpression(nextValue, start !== end ? start : start - 1);
  };

  const handleClear = () => {
    setExpression('');
    setCaretPos(0);
    setLastFormula('');
    setHasEvaluated(false);
    setDisplaySource('manual');
  };

  const handlePercent = () => {
    const { start, end } = getSelection();
    let segStart = start;
    let segEnd = end;

    while (segStart > 0 && isNumericChar(expression[segStart - 1])) segStart -= 1;
    while (segEnd < expression.length && isNumericChar(expression[segEnd])) segEnd += 1;

    if (
      segStart > 0 &&
      expression[segStart - 1] === '-' &&
      (segStart - 1 === 0 || isOperator(expression[segStart - 2]))
    ) {
      segStart -= 1;
    }

    const target = expression.slice(segStart, segEnd);
    if (!target || target === '-') return;

    const replacement = formatNumber((Number(target) || 0) / 100);
    updateExpression(expression.slice(0, segStart) + replacement + expression.slice(segEnd), segStart + replacement.length);
  };

  const handleEqual = () => {
    if (!preview) return;
    const result = formatNumber(preview.result);
    setLastFormula(preview.pretty);
    setExpression(result);
    setCaretPos(result.length);
    setHasEvaluated(true);
    setDisplaySource('manual');
  };

  const applyVoiceExpression = (spokenExpression: string, prettyExpression: string) => {
    const normalized = normalizeExpression(spokenExpression);
    const nextPreview = findEvaluableExpression(normalized);

    if (!nextPreview) {
      setVoiceFeedback('I could not safely compute that spoken expression.');
      return;
    }

    const result = formatNumber(nextPreview.result);
    setLastFormula(prettyExpression || nextPreview.pretty);
    setExpression(result);
    setCaretPos(result.length);
    setHasEvaluated(true);
    setDisplaySource('manual');
  };

  const resolveSubtractBase = () => {
    const currentShownAmount = preview ? preview.result : Number(expression || 0);

    if (displaySource === 'manual' && expression.trim()) {
      return Number.isFinite(currentShownAmount) ? currentShownAmount : baseFareDue;
    }

    if (typeof baseFareDue === 'number' && Number.isFinite(baseFareDue) && baseFareDue > 0) {
      return baseFareDue;
    }

    return Number.isFinite(currentShownAmount) ? currentShownAmount : 0;
  };

  const applyCashTender = (cashAmount: number, shouldSpeak = true) => {
    const subtractBase = resolveSubtractBase();
    const changeAmount = Number((cashAmount - subtractBase).toFixed(2));
    const result = formatNumber(changeAmount);
    const summary =
      changeAmount >= 0
        ? `Passenger money is ${formatNumber(cashAmount)}. Change is ${result} pesos.`
        : `Passenger money is ${formatNumber(cashAmount)}. Still lacking ${formatNumber(Math.abs(changeAmount))} pesos.`;

    setLastFormula(`${formatNumber(cashAmount)} - ${formatNumber(subtractBase)}`);
    setExpression(result);
    setCaretPos(result.length);
    setHasEvaluated(true);
    setDisplaySource('change');
    setVoiceFeedback(summary);

    if (shouldSpeak) {
      const hidePanel = () => scheduleVoicePanelHide();
      const started = speakVoiceReply(summary, { rate: 1.45, onEnd: hidePanel, onError: hidePanel });
      if (!started) hidePanel();
    } else {
      scheduleVoicePanelHide();
    }
  };

  const handleQuickBill = (amount: number) => {
    applyCashTender(amount, false);
    clearVoicePanel();
  };

  const beginVoiceRecognition = (requestedStep: VoiceCalculatorStep = 'expression') => {
    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      const message = 'Voice command is not available in this browser. Use Chrome on Android for the best result.';
      setVoiceFeedback(message);
      void speakVoiceReply(message, { rate: 1.45 });
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
        ? 'Listening... say yes to calculate now or no to keep speaking.'
        : 'Listening... say something like 12 plus 45, 89+87+78 equals, or one thousand pesos.'
    );

    const recognition = new RecognitionCtor();
    voiceRecognitionRef.current = recognition;
    recognition.lang = 'en-PH';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsVoiceListening(true);
    recognition.onerror = event => {
      const message = getSpeechRecognitionErrorMessage(event.error);
      setVoiceFeedback(message);
      setIsVoiceListening(false);
      void speakVoiceReply(message, { rate: 1.45 });
    };
    recognition.onresult = event => {
      const { transcript, confidence } = extractRecognitionTranscript(event);
      setVoiceTranscript(transcript);
      setVoiceConfidence(confidence);

      if (requestedStep === 'confirm-expression') {
        const answer = parseVoiceBinaryAnswer(transcript);
        if (answer === 'yes' && pendingVoiceExpression) {
          applyVoiceExpression(pendingVoiceExpression.expression, pendingVoiceExpression.prettyExpression);
          const summary = `Computed ${pendingVoiceExpression.prettyExpression} = ${pendingVoiceExpression.resultText}.`;
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
          const retryMessage = 'Okay. Keep speaking the full expression now. Say equals if you want me to calculate right away.';
          setVoiceFeedback(retryMessage);
          const beginRetry = () => window.setTimeout(() => beginVoiceRecognition('expression'), 320);
          const started = speakVoiceReply(retryMessage, { rate: 1.45, onEnd: beginRetry, onError: beginRetry });
          if (!started) beginRetry();
          return;
        }

        const nextMessage = 'Please say yes if you are finished speaking, or say no if you want to keep speaking.';
        setVoiceFeedback(nextMessage);
        const restartConfirm = () => window.setTimeout(() => beginVoiceRecognition('confirm-expression'), 320);
        const started = speakVoiceReply(nextMessage, { rate: 1.45, onEnd: restartConfirm, onError: restartConfirm });
        if (!started) restartConfirm();
        return;
      }

      const cashResult = parseCashVoiceTranscript(transcript);
      const parsedExpression = parseCalculatorVoiceTranscript(transcript);

      if (cashResult.status === 'match' && (parsedExpression.status !== 'match' || parsedExpression.operatorCount === 0)) {
        setPendingVoiceExpression(null);
        setVoiceStep('expression');
        applyCashTender(cashResult.amount);
        return;
      }

      if (parsedExpression.status === 'match') {
        const computedPreview = findEvaluableExpression(parsedExpression.expression);
        if (!computedPreview) {
          const nextMessage = 'I heard the math words, but I could not safely compute them. Please say the expression again.';
          setVoiceFeedback(nextMessage);
          void speakVoiceReply(nextMessage, { rate: 1.45 });
          return;
        }

        const resultText = formatNumber(computedPreview.result);
        if (!parsedExpression.explicitEquals && parsedExpression.operatorCount > 0) {
          setPendingVoiceExpression({
            expression: parsedExpression.expression,
            prettyExpression: parsedExpression.prettyExpression,
            resultText,
            usesPemdas: parsedExpression.usesPemdas
          });
          const pemdasMessage = parsedExpression.usesPemdas
            ? ' I will use PEMDAS, so multiply and divide happen before add and subtract.'
            : '';
          const nextMessage = `I heard ${parsedExpression.prettyExpression}.${pemdasMessage} Are you finished speaking? Say yes to calculate now or no to keep speaking.`;
          setVoiceFeedback(nextMessage);
          const beginConfirm = () => window.setTimeout(() => beginVoiceRecognition('confirm-expression'), 320);
          const started = speakVoiceReply(nextMessage, { rate: 1.45, onEnd: beginConfirm, onError: beginConfirm });
          if (!started) beginConfirm();
          return;
        }

        applyVoiceExpression(parsedExpression.expression, parsedExpression.prettyExpression);
        setPendingVoiceExpression(null);
        setVoiceStep('expression');
        const summary = `Computed ${parsedExpression.prettyExpression} = ${resultText}.`;
        setVoiceFeedback(summary);
        const hidePanel = () => scheduleVoicePanelHide();
        const started = speakVoiceReply(summary, { rate: 1.45, onEnd: hidePanel, onError: hidePanel });
        if (!started) hidePanel();
        return;
      }

      const fallbackMessage =
        parsedExpression.status === 'empty'
          ? cashResult.status === 'match'
            ? 'I heard the amount, but I need either a full math expression or a clear cash amount.'
            : cashResult.message
          : parsedExpression.message;
      setPendingVoiceExpression(null);
      setVoiceStep('expression');
      setVoiceFeedback(fallbackMessage);
      void speakVoiceReply(fallbackMessage, { rate: 1.45 });
    };
    recognition.onend = () => {
      setIsVoiceListening(false);
      voiceRecognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      const message = 'Voice recognition could not start. Please try again.';
      setVoiceFeedback(message);
      setIsVoiceListening(false);
      void speakVoiceReply(message, { rate: 1.45 });
    }
  };

  const startVoiceCalculator = (requestedStep: VoiceCalculatorStep = 'expression') => {
    if (isVoiceListening) {
      voiceRecognitionRef.current?.stop();
      clearVoicePanel();
      return;
    }

    cancelVoiceReply();
    if (requestedStep === 'expression') {
      setPendingVoiceExpression(null);
    }
    beginVoiceRecognition(requestedStep);
  };

  const keyBase = 'rounded-2xl select-none active:scale-[0.98] transition-transform';
  const keyLight = 'bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm';
  const keyFunc = 'bg-slate-100 dark:bg-white/5 font-bold text-slate-500';
  const keyOp = 'bg-primary text-white text-2xl font-black';
  const keyEq = 'bg-[#0f172a] text-white text-2xl font-black';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-fade-in dark:bg-night-charcoal">
        <div className="flex shrink-0 items-center justify-between px-6 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <span className="material-icons text-sm">calculate</span>
            </div>
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{title}</h2>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Change And Voice Math</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => startVoiceCalculator('expression')}
              disabled={!canUseVoiceRecognition}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-90 ${
                isVoiceListening
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-300'
              } ${!canUseVoiceRecognition ? 'opacity-50' : ''}`}
              title={canUseVoiceRecognition ? 'Voice calculator' : 'Voice not available in this browser'}
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 visible-scrollbar sm:px-5">
          <div className="rounded-[1.75rem] bg-[#0f172a] p-3 shadow-inner dark:bg-black sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Expression</p>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-200">
                Fare Due {peso}{formatNumber(baseFareDue)}
              </span>
            </div>

            <div className="mt-2 rounded-[1.5rem] border border-white/10 bg-white/5 px-3 py-2.5">
              <input
                ref={inputRef}
                type="text"
                inputMode="none"
                value={displayExpression(expression)}
                onChange={handleInputChange}
                onClick={handleSelect}
                onKeyUp={handleSelect}
                onSelect={handleSelect}
                placeholder="0"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-transparent text-base font-900 leading-tight tracking-wide text-white outline-none placeholder:text-slate-500 caret-white sm:text-lg"
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
              <p className="mt-2 min-h-[16px] overflow-x-auto whitespace-nowrap text-[10px] font-black tracking-widest text-slate-400 scrollbar-hide">
                {formulaLine}
              </p>
              <div className="mt-3 rounded-[1.35rem] border border-white/10 bg-white/5 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Result</p>
                  <p className="overflow-x-auto whitespace-nowrap text-[clamp(2rem,10vw,3rem)] font-900 leading-none tracking-tight text-white scrollbar-hide">
                    {previewResult}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {(voiceFeedback || voiceTranscript || isVoiceListening) && (
            <div className="mt-3 rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-black/20">
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

          {showQuickBills && (
            <div className="mt-4">
              <p className="mb-2 ml-2 text-[8px] font-black uppercase tracking-widest text-slate-400">Quick Bills (PHP)</p>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {quickBills.map(bill => (
                  <button
                    key={bill}
                    onClick={() => handleQuickBill(bill)}
                    className="min-w-[60px] flex-shrink-0 rounded-2xl border border-slate-100 bg-white py-2 shadow-sm transition-all active:scale-95 dark:border-white/10 dark:bg-white/5"
                  >
                    <span className="text-base font-900 text-primary">{peso}{bill}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-4 gap-2">
            <button onClick={handleClear} className={`${keyBase} ${keyFunc} py-3`}>
              AC
            </button>
            <button onClick={handlePercent} className={`${keyBase} ${keyFunc} py-3`}>
              %
            </button>
            <button onClick={handleBackspace} className={`${keyBase} ${keyFunc} py-3`}>
              <span className="text-lg leading-none">{BACKSPACE}</span>
            </button>
            <button onClick={handleEqual} className={`${keyBase} ${keyEq} py-3`}>
              =
            </button>

            {[7, 8, 9].map(n => (
              <button key={n} onClick={() => handleDigit(String(n))} className={`${keyBase} ${keyLight} py-3`}>
                {n}
              </button>
            ))}
            <button onClick={() => handleOperator('/')} className={`${keyBase} ${keyOp} py-3`}>
              {DIVIDE}
            </button>

            {[4, 5, 6].map(n => (
              <button key={n} onClick={() => handleDigit(String(n))} className={`${keyBase} ${keyLight} py-3`}>
                {n}
              </button>
            ))}
            <button onClick={() => handleOperator('*')} className={`${keyBase} ${keyOp} py-3`}>
              {MULTIPLY}
            </button>

            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => handleDigit(String(n))} className={`${keyBase} ${keyLight} py-3`}>
                {n}
              </button>
            ))}
            <button onClick={() => handleOperator('-')} className={`${keyBase} ${keyOp} py-3`}>
              -
            </button>

            <button onClick={() => handleDigit('0')} className={`${keyBase} ${keyLight} col-span-2 py-3`}>
              0
            </button>
            <button onClick={() => handleDigit('.')} className={`${keyBase} ${keyLight} py-3`}>
              .
            </button>
            <button onClick={() => handleOperator('+')} className={`${keyBase} ${keyOp} py-3`}>
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConductorCalcOverlay;
