import React, { useEffect, useRef, useState } from "react";
import FloatingVoiceButton from "./FloatingVoiceButton";
import type { BrowserSpeechRecognition } from "../utils/voice";
import {
  cancelVoiceReply,
  extractRecognitionTranscript,
  formatVoiceConfidence,
  getSpeechRecognitionCtor,
  getSpeechRecognitionErrorMessage,
  parseCalculatorVoiceTranscript,
  parseCashVoiceTranscript,
  speakVoiceReply
} from "../utils/voice";

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

const ConductorCalcOverlay: React.FC<Props> = ({
  isOpen,
  onClose,
  initialValue,
  title = "Conductor Calc",
  showQuickBills = true,
  assistantPreset = null,
}) => {
  const [display, setDisplay] = useState(initialValue.toString());
  const [expression, setExpression] = useState("");
  const [lastOp, setLastOp] = useState("");
  const [typedFirst, setTypedFirst] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const canUseVoiceRecognition = Boolean(getSpeechRecognitionCtor());

  const formatExpressionText = (value: string) => value.replace(/\*/g, " x ").replace(/\//g, " / ");
  const formatCalcNumber = (value: number) =>
    Number.isInteger(value) ? value.toString() : Number(value.toFixed(2)).toString();
  const baseFareDue = assistantPreset?.fareAmount ?? initialValue;

  useEffect(() => {
    if (!isOpen) return;

    setIsVoiceListening(false);
    setVoiceTranscript("");
    setVoiceConfidence(null);

    if (assistantPreset) {
      setDisplay(formatCalcNumber(assistantPreset.changeAmount));
      setExpression(`${formatCalcNumber(assistantPreset.cashAmount)} - ${formatCalcNumber(assistantPreset.fareAmount)} = `);
      setLastOp("=");
      setTypedFirst(false);
      setVoiceFeedback(assistantPreset.summary);
      return;
    }

    setDisplay(initialValue.toString());
    setExpression("");
    setLastOp("");
    setTypedFirst(false);
    setVoiceFeedback(null);
  }, [assistantPreset, initialValue, isOpen]);

  useEffect(() => {
    return () => {
      voiceRecognitionRef.current?.abort();
      voiceRecognitionRef.current = null;
      cancelVoiceReply();
    };
  }, []);

  if (!isOpen) return null;

  const handleClose = () => {
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
    cancelVoiceReply();
    setIsVoiceListening(false);
    onClose();
  };

  const parseBinaryExpression = (expr: string) => {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 3) throw new Error("Invalid expression format");

    const a = Number(parts[0]);
    const op = parts[1];
    const b = Number(parts[2]);

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      throw new Error("Invalid number");
    }

    if (!["+", "-", "*", "/"].includes(op)) {
      throw new Error("Invalid operator");
    }

    return { a, op, b };
  };

  const computeBinary = (a: number, op: string, b: number) => {
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        if (b === 0) throw new Error("Division by zero");
        return a / b;
      default:
        throw new Error("Invalid operator");
    }
  };

  const handleNumber = (num: string) => {
    if (display === "Error") {
      setDisplay(num === "." ? "0." : num);
      setExpression("");
      setLastOp("");
      setTypedFirst(true);
      return;
    }

    if (num === "." && display.includes(".")) return;

    if (lastOp === "=") {
      setDisplay(num === "." ? "0." : num);
      setLastOp("");
      setTypedFirst(true);
      return;
    }

    if (display === "0") {
      setDisplay(num === "." ? "0." : num);
    } else {
      setDisplay(display + num);
    }

    setTypedFirst(true);
  };

  const handleOperator = (op: string) => {
    if (display === "Error") return;

    setExpression(display + " " + op + " ");
    setDisplay("0");
    setLastOp(op);
    setTypedFirst(false);
  };

  const handleClear = () => {
    setDisplay("0");
    setExpression("");
    setLastOp("");
    setTypedFirst(false);
  };

  const handleBackspace = () => {
    if (display === "Error") {
      handleClear();
      return;
    }

    if (lastOp === "=") setLastOp("");

    if (display.length <= 1) {
      setDisplay("0");
      setTypedFirst(false);
      return;
    }

    const next = display.slice(0, -1);
    setDisplay(next === "-" || next === "" ? "0" : next);
    setTypedFirst(true);
  };

  const handlePercent = () => {
    if (display === "Error") return;
    const current = parseFloat(display) || 0;
    setDisplay((current / 100).toString());
    setTypedFirst(true);
  };

  const handleEqual = () => {
    if (display === "Error") return;

    try {
      const full = (expression + display).trim();

      if (!expression.trim()) {
        setLastOp("=");
        setTypedFirst(false);
        return;
      }

      const { a, op, b } = parseBinaryExpression(full);
      const result = computeBinary(a, op, b);

      const normalized = Number.isInteger(result)
        ? result.toString()
        : Number(result.toFixed(10)).toString();

      setDisplay(normalized);
      setExpression("");
      setLastOp("=");
      setTypedFirst(false);
    } catch {
      setDisplay("Error");
      setExpression("");
      setLastOp("");
      setTypedFirst(false);
    }
  };

  const quickBills = [20, 50, 100, 200, 500, 1000];

  const liveExpression = (() => {
    if (!expression.trim()) {
      return typedFirst || lastOp === "=" || display !== "0" ? formatExpressionText(display) : "";
    }

    const shouldAppendDisplay = typedFirst || display !== "0" || lastOp === "=";
    return formatExpressionText(`${expression}${shouldAppendDisplay ? display : ""}`.trim());
  })();

  const handleQuickBill = (amount: number) => {
    if (display === "Error") return;

    const current = parseFloat(display) || 0;

    if (typedFirst) {
      setDisplay((amount - current).toString());
      setTypedFirst(false);
      return;
    }

    setDisplay((current + amount).toString());
  };

  const applyVoiceExpression = (spokenExpression: string) => {
    const match = spokenExpression.match(/^(-?\d+(?:\.\d+)?)([+\-*/])(-?\d+(?:\.\d+)?)$/);
    if (!match) {
      setVoiceFeedback("Voice calculator here supports one clear operation at a time, like 12 plus 45.");
      return;
    }

    const [, left, op, right] = match;
    try {
      const result = computeBinary(Number(left), op, Number(right));
      const normalized = Number.isInteger(result)
        ? result.toString()
        : Number(result.toFixed(10)).toString();

      setDisplay(normalized);
      setExpression(`${left} ${op} ${right} = `);
      setLastOp("=");
      setTypedFirst(false);
    } catch {
      setDisplay("Error");
      setExpression("");
      setLastOp("");
      setTypedFirst(false);
    }
  };

  const applyVoiceCashTender = (cashAmount: number, shouldSpeak = true) => {
    const changeAmount = Number((cashAmount - baseFareDue).toFixed(2));
    const summary =
      changeAmount >= 0
        ? `Passenger money is ${formatCalcNumber(cashAmount)}. Change is ${formatCalcNumber(changeAmount)} pesos.`
        : `Passenger money is ${formatCalcNumber(cashAmount)}. Still lacking ${formatCalcNumber(Math.abs(changeAmount))} pesos.`;

    setDisplay(formatCalcNumber(changeAmount));
    setExpression(`${formatCalcNumber(cashAmount)} - ${formatCalcNumber(baseFareDue)} = `);
    setLastOp("=");
    setTypedFirst(false);
    setVoiceFeedback(summary);

    if (shouldSpeak) {
      speakVoiceReply(summary);
    }
  };

  const startVoiceCalculator = () => {
    if (isVoiceListening) {
      voiceRecognitionRef.current?.stop();
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      const message = "Voice command is not available in this browser. Use Chrome on Android for the best result.";
      setVoiceFeedback(message);
      speakVoiceReply(message);
      return;
    }

    cancelVoiceReply();
    setVoiceTranscript("");
    setVoiceFeedback("Listening... say something like 12 plus 45 or one thousand pesos.");
    setVoiceConfidence(null);

    const recognition = new RecognitionCtor();
    voiceRecognitionRef.current = recognition;
    recognition.lang = "en-PH";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsVoiceListening(true);
    recognition.onerror = event => {
      const message = getSpeechRecognitionErrorMessage(event.error);
      setVoiceFeedback(message);
      setIsVoiceListening(false);
      speakVoiceReply(message);
    };
    recognition.onresult = event => {
      const { transcript, confidence } = extractRecognitionTranscript(event);
      const parsedExpression = parseCalculatorVoiceTranscript(transcript);

      setVoiceTranscript(transcript);
      setVoiceConfidence(confidence);

      if (parsedExpression.status === "match") {
        const expressionMatch = parsedExpression.expression.match(/^(-?\d+(?:\.\d+)?)([+\-*/])(-?\d+(?:\.\d+)?)$/);
        applyVoiceExpression(parsedExpression.expression);
        const summary = expressionMatch
          ? (() => {
              const result = computeBinary(
                Number(expressionMatch[1]),
                expressionMatch[2] as "+" | "-" | "*" | "/",
                Number(expressionMatch[3])
              );
              const resultText = Number.isInteger(result)
                ? result.toString()
                : Number(result.toFixed(10)).toString();
              return `Computed ${parsedExpression.prettyExpression} = ${resultText}.`;
            })()
          : `Computed ${parsedExpression.prettyExpression}.`;
        setVoiceFeedback(summary);
        speakVoiceReply(summary);
        return;
      }

      const cashResult = parseCashVoiceTranscript(transcript);
      if (cashResult.status === "match") {
        applyVoiceCashTender(cashResult.amount);
        return;
      }

      const fallbackMessage =
        parsedExpression.status === "empty"
          ? cashResult.message
          : parsedExpression.message;
      setVoiceFeedback(fallbackMessage);
      speakVoiceReply(fallbackMessage);
    };
    recognition.onend = () => {
      setIsVoiceListening(false);
      voiceRecognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      const message = "Voice recognition could not start. Please try again.";
      setVoiceFeedback(message);
      setIsVoiceListening(false);
      speakVoiceReply(message);
    }
  };

  const keyBase =
    "rounded-2xl select-none active:scale-[0.98] transition-transform";
  const keyLight =
    "bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm";
  const keyFunc =
    "bg-slate-100 dark:bg-white/5 font-bold text-slate-500";
  const keyOp = "bg-primary text-white text-2xl font-black";
  const keyEq = "bg-[#0f172a] text-white text-2xl font-black";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-fade-in dark:bg-night-charcoal">
        <div className="px-6 pt-6 pb-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white">
              <span className="material-icons text-sm">calculate</span>
            </div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              {title}
            </h2>
          </div>

          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 active:scale-90"
          >
            <span className="material-icons text-sm">close</span>
          </button>
        </div>

        <div className="px-6 mb-3 shrink-0">
          <div className="bg-[#0f172a] dark:bg-black rounded-[2rem] p-6 text-right shadow-inner">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-4 mb-1">
              {liveExpression}
            </p>

            <div className="w-full overflow-hidden">
              <h3 className="block w-full pr-2 text-white text-6xl font-900 tracking-tighter leading-none tabular-nums">
                {display}
              </h3>
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
        </div>

        <div className="flex flex-col flex-1 min-h-0">

          {showQuickBills && (
            <div className="px-6 mb-3 shrink-0">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">
                Quick Bills (PHP)
              </p>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {quickBills.map((bill) => (
                  <button
                    key={bill}
                    onClick={() => handleQuickBill(bill)}
                    className="flex-shrink-0 min-w-[60px] py-2 bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl shadow-sm active:bg-slate-50 transition-all"
                  >
                    <span className="text-base font-900 text-primary">
                      P{bill}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-6 pb-4 grid grid-cols-4 gap-2 flex-1 auto-rows-fr">
            <button onClick={handleClear} className={`${keyBase} ${keyFunc} py-3`}>
              AC
            </button>
            <button onClick={handlePercent} className={`${keyBase} ${keyFunc} py-3`}>
              %
            </button>
            <button onClick={handleBackspace} className={`${keyBase} ${keyFunc} py-3`}>
              <span className="material-icons text-base">backspace</span>
            </button>
            <button onClick={() => handleOperator("/")} className={`${keyBase} ${keyOp} py-3`}>
              /
            </button>

            {[7, 8, 9].map((n) => (
              <button key={n} onClick={() => handleNumber(String(n))} className={`${keyBase} ${keyLight} py-3`}>
                {n}
              </button>
            ))}
            <button onClick={() => handleOperator("*")} className={`${keyBase} ${keyOp} py-3`}>
              x
            </button>

            {[4, 5, 6].map((n) => (
              <button key={n} onClick={() => handleNumber(String(n))} className={`${keyBase} ${keyLight} py-3`}>
                {n}
              </button>
            ))}
            <button onClick={() => handleOperator("-")} className={`${keyBase} ${keyOp} py-3`}>
              -
            </button>

            {[1, 2, 3].map((n) => (
              <button key={n} onClick={() => handleNumber(String(n))} className={`${keyBase} ${keyLight} py-3`}>
                {n}
              </button>
            ))}
            <button onClick={() => handleOperator("+")} className={`${keyBase} ${keyOp} py-3`}>
              +
            </button>

            <button onClick={() => handleNumber("0")} className={`${keyBase} ${keyLight} py-3 col-span-2`}>
              0
            </button>
            <button onClick={() => handleNumber(".")} className={`${keyBase} ${keyLight} py-3`}>
              .
            </button>
            <button onClick={handleEqual} className={`${keyBase} ${keyEq} py-3`}>
              =
            </button>
          </div>
        </div>
      </div>

      <FloatingVoiceButton
        active={isVoiceListening}
        disabled={!canUseVoiceRecognition}
        label="Voice calculator"
        title={canUseVoiceRecognition ? "Voice calculator" : "Voice not available in this browser"}
        onActivate={startVoiceCalculator}
      />
    </div>
  );
};

export default ConductorCalcOverlay;
