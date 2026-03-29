import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BrowserSpeechRecognition } from '../utils/voice';
import {
  formatVoiceConfidence,
  getSpeechRecognitionCtor,
  getSpeechRecognitionErrorMessage,
  parseCalculatorVoiceTranscript
} from '../utils/voice';

type Operator = '+' | '-' | '*' | '/';

type Token =
  | { type: 'number'; raw: string; value: number }
  | { type: 'operator'; op: Operator };

type AstNode =
  | { type: 'number'; raw: string; value: number }
  | { type: 'binary'; op: Operator; left: AstNode; right: AstNode };

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const precedence: Record<Operator, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2
};

const MULTIPLY = '\u00D7';
const DIVIDE = '\u00F7';
const BACKSPACE = '\u232B';

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

const NormalCalcOverlay: React.FC<Props> = ({ isOpen, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expression, setExpression] = useState('');
  const [caretPos, setCaretPos] = useState(0);
  const [lastFormula, setLastFormula] = useState('');
  const [hasEvaluated, setHasEvaluated] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const canUseVoiceRecognition = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  useEffect(() => {
    if (!isOpen) return;
    setExpression('');
    setCaretPos(0);
    setLastFormula('');
    setHasEvaluated(false);
    setIsVoiceListening(false);
    setVoiceTranscript('');
    setVoiceFeedback(null);
    setVoiceConfidence(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !inputRef.current) return;
    const nextPos = Math.min(caretPos, expression.length);
    inputRef.current.focus();
    inputRef.current.setSelectionRange(nextPos, nextPos);
  }, [caretPos, expression, isOpen]);

  useEffect(() => {
    return () => {
      voiceRecognitionRef.current?.abort();
      voiceRecognitionRef.current = null;
    };
  }, []);

  const preview = useMemo(() => findEvaluableExpression(expression), [expression]);
  const previewResult = preview ? formatNumber(preview.result) : '0';
  const formulaLine = hasEvaluated && lastFormula ? `${lastFormula} =` : (preview?.pretty || '');

  if (!isOpen) return null;

  const getSelection = () => ({
    start: inputRef.current?.selectionStart ?? caretPos,
    end: inputRef.current?.selectionEnd ?? caretPos
  });

  const updateExpression = (nextValue: string, nextCaret: number, preserveFormula = false) => {
    const normalized = normalizeExpression(nextValue);
    setExpression(normalized);
    setCaretPos(Math.min(nextCaret, normalized.length));
    setHasEvaluated(false);
    if (!preserveFormula) setLastFormula('');
  };

  const startVoiceCalculator = () => {
    if (isVoiceListening) {
      voiceRecognitionRef.current?.stop();
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setVoiceFeedback('Voice command is not available in this browser. Use Chrome on Android for the best result.');
      return;
    }

    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceFeedback('Listening... say something like "12 plus 45" or "60 times point eight".');

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
      const recognitionResult = event.results[event.results.length - 1];
      const alternative = recognitionResult?.[0];
      const transcript = alternative?.transcript?.trim() ?? '';
      const confidence = typeof alternative?.confidence === 'number' ? alternative.confidence : null;
      const parsed = parseCalculatorVoiceTranscript(transcript);

      setVoiceTranscript(transcript);
      setVoiceConfidence(confidence);

      if (parsed.status === 'match') {
        applyVoiceExpression(parsed.expression, parsed.prettyExpression);
        setVoiceFeedback(`Computed ${parsed.prettyExpression}.`);
      } else {
        setVoiceFeedback(parsed.message);
      }
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
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[92vh] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-fade-in dark:bg-night-charcoal">
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-md">
              <span className="material-icons text-base">calculate</span>
            </div>
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Calculator</h2>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Normal Math</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={startVoiceCalculator}
              className={`flex h-9 min-w-[44px] items-center justify-center rounded-full px-3 text-[10px] font-black uppercase tracking-widest active:scale-90 ${
                isVoiceListening
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
              }`}
              title={canUseVoiceRecognition ? 'Voice calculator' : 'Voice not available in this browser'}
            >
              <span className="material-icons text-base">{isVoiceListening ? 'mic' : 'mic_none'}</span>
            </button>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 active:scale-90 dark:bg-white/10"
            >
              <span className="material-icons text-base">close</span>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 visible-scrollbar">
          <div className="rounded-[2rem] bg-[#0f172a] p-4 shadow-inner dark:bg-black">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Expression</p>
            <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
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
                className="w-full bg-transparent text-lg font-900 leading-tight tracking-wide text-white outline-none placeholder:text-slate-500 caret-white"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => moveCaret(-1)}
                  disabled={caretPos === 0}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-300 active:scale-95 disabled:opacity-40"
                >
                  Cursor Left
                </button>
                <button
                  onClick={() => moveCaret(1)}
                  disabled={caretPos >= expression.length}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-300 active:scale-95 disabled:opacity-40"
                >
                  Cursor Right
                </button>
              </div>
              <p className="mt-2 min-h-[16px] overflow-x-auto whitespace-nowrap text-[10px] font-black tracking-widest text-slate-400 scrollbar-hide">
                {formulaLine}
              </p>
            </div>

            <div className="mt-3 rounded-2xl bg-white/5 px-4 py-4">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Result</p>
              <p className="mt-2 overflow-x-auto whitespace-nowrap text-5xl font-900 leading-none tracking-tighter text-white scrollbar-hide">
                {previewResult}
              </p>
            </div>
          </div>

          {(voiceFeedback || voiceTranscript) && (
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

          <div className="mt-3 grid grid-cols-4 gap-2">
            <button
              onClick={handleClear}
              className="h-12 rounded-2xl bg-slate-100 text-[11px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:bg-white/10"
            >
              AC
            </button>
            <button
              onClick={handlePercent}
              className="h-12 rounded-2xl bg-slate-100 text-xl font-black text-slate-500 active:scale-95 dark:bg-white/10"
            >
              %
            </button>
            <button
              onClick={handleBackspace}
              className="h-12 rounded-2xl bg-slate-100 text-xl font-black text-slate-500 active:scale-95 dark:bg-white/10"
            >
              {BACKSPACE}
            </button>
            <button
              onClick={handleEqual}
              className="h-12 rounded-2xl bg-[#0f172a] text-xl font-black text-white shadow-sm active:scale-95"
            >
              =
            </button>

            {[['7', '8', '9', '/'], ['4', '5', '6', '*'], ['1', '2', '3', '-']].map(row =>
              row.map(key => (
                <button
                  key={key}
                  onClick={() => (isOperator(key) ? handleOperator(key) : handleDigit(key))}
                  className={`h-14 rounded-2xl shadow-sm active:scale-95 ${
                    isOperator(key)
                      ? 'bg-primary text-2xl font-black text-white'
                      : 'border border-slate-100 bg-white text-2xl font-900 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white'
                  }`}
                >
                  {displayExpression(key)}
                </button>
              ))
            )}

            <button
              onClick={() => handleDigit('0')}
              className="col-span-2 h-14 rounded-2xl border border-slate-100 bg-white text-2xl font-900 text-slate-900 shadow-sm active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              0
            </button>
            <button
              onClick={() => handleDigit('.')}
              className="h-14 rounded-2xl border border-slate-100 bg-white text-2xl font-900 text-slate-900 shadow-sm active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              .
            </button>
            <button
              onClick={() => handleOperator('+')}
              className="h-14 rounded-2xl bg-primary text-2xl font-black text-white shadow-sm active:scale-95"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NormalCalcOverlay;
