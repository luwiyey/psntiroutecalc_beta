import React, { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialValue: number;
}

const ConductorCalcOverlay: React.FC<Props> = ({
  isOpen,
  onClose,
  initialValue,
}) => {
  const [display, setDisplay] = useState(initialValue.toString());
  const [expression, setExpression] = useState("");
  const [lastOp, setLastOp] = useState("");
  const [typedFirst, setTypedFirst] = useState(false);

  if (!isOpen) return null;

  /* ---------------- SAFE CALCULATION (NO EVAL) ---------------- */

  const parseBinaryExpression = (expr: string) => {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 3) throw new Error("Invalid expression format");

    const a = Number(parts[0]);
    const op = parts[1];
    const b = Number(parts[2]);

    if (!Number.isFinite(a) || !Number.isFinite(b))
      throw new Error("Invalid number");

    if (!["+", "-", "*", "/"].includes(op))
      throw new Error("Invalid operator");

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

  /* ---------------- INPUT HANDLERS ---------------- */

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

  /* ---------------- STYLES ---------------- */

  const keyBase =
    "rounded-2xl select-none active:scale-[0.98] transition-transform";
  const keyLight =
    "bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm";
  const keyFunc =
    "bg-slate-100 dark:bg-white/5 font-bold text-slate-500";
  const keyOp = "bg-primary text-white text-2xl font-black";
  const keyEq = "bg-[#0f172a] text-white text-2xl font-black";

  /* ---------------- UI ---------------- */

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-white dark:bg-night-charcoal rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl animate-fade-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white">
              <span className="material-icons text-sm">calculate</span>
            </div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              Conductor Calc
            </h2>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 active:scale-90"
          >
            <span className="material-icons text-sm">close</span>
          </button>
        </div>

        {/* Display */}
        <div className="px-6 mb-3 shrink-0">
          <div className="bg-[#0f172a] dark:bg-black rounded-[2rem] p-6 text-right shadow-inner">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-4 mb-1">
              {expression}
            </p>

            <div className="w-full overflow-hidden">
              <h3 className="block w-full pr-2 text-white text-6xl font-900 tracking-tighter leading-none tabular-nums">
                {display}
              </h3>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Quick Bills */}
          <div className="px-6 mb-3 shrink-0">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">
              Quick Bills (₱)
            </p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {quickBills.map((bill) => (
                <button
                  key={bill}
                  onClick={() => handleQuickBill(bill)}
                  className="flex-shrink-0 min-w-[60px] py-2 bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl shadow-sm active:bg-slate-50 transition-all"
                >
                  <span className="text-base font-900 text-primary">
                    ₱{bill}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Keypad */}
          <div className="px-6 pb-4 grid grid-cols-4 gap-2 flex-1 auto-rows-fr">
            <button onClick={handleClear} className={`${keyBase} ${keyFunc} py-3`}>
              AC
            </button>
            <button onClick={handlePercent} className={`${keyBase} ${keyFunc} py-3`}>
              %
            </button>
            <button onClick={handleBackspace} className={`${keyBase} ${keyFunc} py-3`}>
              ⌫
            </button>
            <button onClick={() => handleOperator("/")} className={`${keyBase} ${keyOp} py-3`}>
              ÷
            </button>

            {[7,8,9].map(n => (
              <button key={n} onClick={() => handleNumber(String(n))} className={`${keyBase} ${keyLight} py-3`}>
                {n}
              </button>
            ))}
            <button onClick={() => handleOperator("*")} className={`${keyBase} ${keyOp} py-3`}>
              ×
            </button>

            {[4,5,6].map(n => (
              <button key={n} onClick={() => handleNumber(String(n))} className={`${keyBase} ${keyLight} py-3`}>
                {n}
              </button>
            ))}
            <button onClick={() => handleOperator("-")} className={`${keyBase} ${keyOp} py-3`}>
              -
            </button>

            {[1,2,3].map(n => (
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
    </div>
  );
};

export default ConductorCalcOverlay;