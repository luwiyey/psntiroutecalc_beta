
import React, { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialValue: number;
}

const ConductorCalcOverlay: React.FC<Props> = ({ isOpen, onClose, initialValue }) => {
  const [display, setDisplay] = useState(initialValue.toString());
  const [expression, setExpression] = useState('');
  const [lastOp, setLastOp] = useState('');

  if (!isOpen) return null;

  const handleNumber = (num: string) => {
    if (display === '0' || lastOp === '=') {
      setDisplay(num);
    } else {
      setDisplay(display + num);
    }
    if (lastOp === '=') setLastOp('');
  };

  const handleOperator = (op: string) => {
    setExpression(display + ' ' + op + ' ');
    setDisplay('0');
    setLastOp(op);
  };

  const handleClear = () => {
    setDisplay('0');
    setExpression('');
    setLastOp('');
  };

  const handleEqual = () => {
    try {
      // Basic math evaluation (safe for simple calc)
      const result = eval(expression + display);
      setDisplay(result.toString());
      setExpression('');
      setLastOp('=');
    } catch (e) {
      setDisplay('Error');
    }
  };

  const quickBills = [20, 50, 100, 200, 500, 1000];

  const handleQuickBill = (amount: number) => {
    const current = parseFloat(display) || 0;
    setDisplay((current + amount).toString());
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-night-charcoal rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl animate-fade-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white">
              <span className="material-icons text-sm">calculate</span>
            </div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Conductor Calc</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 active:scale-90">
            <span className="material-icons text-sm">close</span>
          </button>
        </div>

        {/* Display Area */}
        <div className="px-6 mb-4">
          <div className="bg-[#0f172a] dark:bg-black rounded-[2rem] p-8 text-right shadow-inner">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-4 mb-1">
              {expression}
            </p>
            <h3 className="text-white text-6xl font-900 tracking-tighter truncate leading-none">
              {display}
            </h3>
          </div>
        </div>

        {/* Quick Bills */}
        <div className="px-6 mb-6">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">Quick Bills (₱)</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {quickBills.map(bill => (
              <button 
                key={bill}
                onClick={() => handleQuickBill(bill)}
                className="flex-shrink-0 min-w-[70px] py-4 bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl shadow-sm active:bg-slate-50 transition-all"
              >
                <span className="text-lg font-900 text-primary">₱{bill}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Keypad */}
        <div className="px-6 pb-8 grid grid-cols-4 gap-2">
          {/* Row 1 */}
          <button onClick={handleClear} className="h-14 rounded-2xl bg-slate-100 dark:bg-white/5 font-bold text-slate-500">AC</button>
          <button className="h-14 rounded-2xl bg-slate-100 dark:bg-white/5 font-bold text-slate-500">+/-</button>
          <button className="h-14 rounded-2xl bg-slate-100 dark:bg-white/5 font-bold text-slate-500">%</button>
          <button onClick={() => handleOperator('/')} className="h-14 rounded-2xl bg-primary text-white text-2xl font-black">÷</button>
          
          {/* Row 2 */}
          <button onClick={() => handleNumber('7')} className="h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">7</button>
          <button onClick={() => handleNumber('8')} className="h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">8</button>
          <button onClick={() => handleNumber('9')} className="h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">9</button>
          <button onClick={() => handleOperator('*')} className="h-14 rounded-2xl bg-primary text-white text-2xl font-black">×</button>

          {/* Row 3 */}
          <button onClick={() => handleNumber('4')} className="h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">4</button>
          <button onClick={() => handleNumber('5')} className="h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">5</button>
          <button onClick={() => handleNumber('6')} className="h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">6</button>
          <button onClick={() => handleOperator('-')} className="h-14 rounded-2xl bg-primary text-white text-3xl font-black">-</button>

          {/* Row 4 */}
          <button onClick={() => handleNumber('1')} className="h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">1</button>
          <button onClick={() => handleNumber('2')} className="h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">2</button>
          <button onClick={() => handleNumber('3')} className="h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">3</button>
          <button onClick={() => handleOperator('+')} className="h-14 rounded-2xl bg-primary text-white text-2xl font-black">+</button>

          {/* Row 5 */}
          <button onClick={() => handleNumber('0')} className="col-span-2 h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">0</button>
          <button onClick={() => handleNumber('.')} className="h-14 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 text-xl font-900 shadow-sm">.</button>
          <button onClick={handleEqual} className="h-14 rounded-2xl bg-[#0f172a] text-white text-2xl font-black">=</button>
        </div>
      </div>
    </div>
  );
};

export default ConductorCalcOverlay;
