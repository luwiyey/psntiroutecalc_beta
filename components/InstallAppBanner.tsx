import React from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface Props {
  deferredPrompt: BeforeInstallPromptEvent | null;
  onDismiss: () => void;
  onInstalled: () => void;
}

const InstallAppBanner: React.FC<Props> = ({ deferredPrompt, onDismiss, onInstalled }) => {
  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === 'accepted') {
      onInstalled();
      return;
    }

    onDismiss();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+78px)] z-[120] flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-[1.5rem] border border-primary/10 bg-white/95 px-4 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.14)] backdrop-blur dark:border-white/10 dark:bg-night-charcoal/95">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Install App</p>
          <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-100">
            Install app for better experience.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onDismiss}
            className="rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 active:scale-95"
          >
            Later
          </button>
          <button
            onClick={handleInstall}
            className="rounded-full bg-primary px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-sm active:scale-95"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallAppBanner;
