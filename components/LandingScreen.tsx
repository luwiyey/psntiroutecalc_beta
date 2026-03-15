import React, { useState } from 'react';
import SupportContactSheet from './SupportContactSheet';

export const LandingScreen: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-between px-8 py-8 text-white font-sans">
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
            Multi-Route <span className="mx-1 text-white/60">-</span> Ready
          </p>
          <p className="text-[13px] font-normal uppercase tracking-widest text-white/80">
            Fare & Tally System
          </p>
        </div>
      </div>

      <div className="w-full max-w-xs space-y-6 flex flex-col items-center pb-4">
        <button
          onClick={onFinish}
          className="w-full py-5 bg-white text-primary rounded-[2rem] font-semibold uppercase tracking-widest text-[17px] shadow-[0_20px_40px_rgba(0,0,0,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3 border border-white/20"
        >
          START CALCULATING
          <span className="material-icons text-xl">play_arrow</span>
        </button>

        <div className="w-full space-y-4 text-center opacity-80">
          <button
            onClick={() => setIsSupportOpen(true)}
            className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75 transition-all active:scale-95"
          >
            <span>Developed by Zia Louise Mariano</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M22 12.07C22 6.5 17.52 2 12 2S2 6.5 2 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47H15.2c-1.24 0-1.63.78-1.63 1.58v1.89h2.77l-.44 2.9h-2.33V22c4.78-.75 8.43-4.91 8.43-9.93z"/>
            </svg>
          </button>

          <p className="text-[12px] font-normal">Version 1.0.0</p>
        </div>
      </div>

      <SupportContactSheet isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />

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
