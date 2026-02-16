
import React from 'react';

export const LandingScreen: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-between p-10 text-white font-sans">
      <div className="flex-1 flex flex-col items-center justify-center text-center w-full max-w-xs">
        <div className="w-24 h-24 mb-8 bg-white/15 rounded-[2.5rem] flex items-center justify-center backdrop-blur-md border border-white/30 shadow-2xl animate-pulse-slow">
          <span className="material-icons text-white text-6xl">directions_bus</span>
        </div>
        
        <div className="space-y-1 mb-6">
          <h1 className="text-[30px] font-bold tracking-normal leading-tight text-white">
            PSNTI RouteCalc
          </h1>
          <p className="text-[13px] font-semibold tracking-[0.2em] text-white uppercase">
            FOR CONDUCTORS
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-[19px] font-medium text-white">
            Bayambang <span className="mx-1 text-white/60">⇄</span> Baguio
          </p>
          <p className="text-[13px] font-normal uppercase tracking-widest text-white/80">
            Fare & Tally System
          </p>
        </div>
      </div>

      <div className="w-full max-w-xs space-y-10 flex flex-col items-center pb-8">
        <button 
          onClick={onFinish}
          className="w-full py-5 bg-white text-primary rounded-[2rem] font-semibold uppercase tracking-widest text-[17px] shadow-[0_20px_40px_rgba(0,0,0,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3 border border-white/20"
        >
          START CALCULATING
          <span className="material-icons text-xl">play_arrow</span>
        </button>
        
        <div className="text-center opacity-60">
           <p className="text-[12px] font-normal">Version 1.0.0</p>
        </div>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(0.98); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
