import React from 'react';

interface Props {
  onRefresh: () => void;
}

const UpdateAppBanner: React.FC<Props> = ({ onRefresh }) => {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+78px)] z-[121] flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-[1.5rem] border border-emerald-200 bg-white/95 px-4 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.16)] backdrop-blur dark:border-emerald-500/20 dark:bg-night-charcoal/95">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Update Ready</p>
          <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-100">
            New version available. Refresh now.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="shrink-0 rounded-full bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-sm active:scale-95"
        >
          Refresh
        </button>
      </div>
    </div>
  );
};

export default UpdateAppBanner;
