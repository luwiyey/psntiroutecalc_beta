import React from 'react';
import { useApp } from '../context/AppContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const FACEBOOK_PROFILE_URL = 'https://www.facebook.com/suppsiang/';
const FACEBOOK_APP_URL = `fb://facewebmodal/f?href=${encodeURIComponent(FACEBOOK_PROFILE_URL)}`;
const MESSENGER_URL = 'https://m.me/suppsiang';

const openWithFallback = (appUrl: string, fallbackUrl: string) => {
  let appOpened = false;

  const cleanup = () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handleAppOpened);
    window.removeEventListener('blur', handleAppOpened);
  };

  const handleAppOpened = () => {
    appOpened = true;
    cleanup();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      handleAppOpened();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handleAppOpened);
  window.addEventListener('blur', handleAppOpened);

  window.setTimeout(() => {
    cleanup();
    if (appOpened) return;

    const nextWindow = window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    if (!nextWindow) {
      window.location.href = fallbackUrl;
    }
  }, 900);

  window.location.href = appUrl;
};

const SupportContactSheet: React.FC<Props> = ({ isOpen, onClose }) => {
  const { showToast } = useApp();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/55 px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-[2rem] bg-white p-5 shadow-2xl dark:bg-night-charcoal">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Help and Support</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Contact Developer</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 active:scale-90 dark:bg-white/10"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <button
            onClick={() => {
              if (!navigator.onLine) {
                onClose();
                showToast('Internet is needed to open Facebook.', 'info');
                return;
              }
              onClose();
              openWithFallback(FACEBOOK_APP_URL, FACEBOOK_PROFILE_URL);
            }}
            className="flex w-full items-center justify-between rounded-[1.5rem] bg-slate-50 px-4 py-4 text-left shadow-sm transition-all active:scale-[0.99] dark:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1877F2] text-white">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <path d="M22 12.07C22 6.5 17.52 2 12 2S2 6.5 2 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47H15.2c-1.24 0-1.63.78-1.63 1.58v1.89h2.77l-.44 2.9h-2.33V22c4.78-.75 8.43-4.91 8.43-9.93z"/>
                </svg>
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Open Facebook</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Opens app first when available</p>
              </div>
            </div>
            <span className="material-icons text-slate-300">chevron_right</span>
          </button>

          <button
            onClick={() => {
              if (!navigator.onLine) {
                onClose();
                showToast('Internet is needed to open Messenger.', 'info');
                return;
              }
              onClose();
              const nextWindow = window.open(MESSENGER_URL, '_blank', 'noopener,noreferrer');
              if (!nextWindow) {
                window.location.href = MESSENGER_URL;
              }
            }}
            className="flex w-full items-center justify-between rounded-[1.5rem] bg-slate-50 px-4 py-4 text-left shadow-sm transition-all active:scale-[0.99] dark:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0084FF] text-white">
                <span className="material-icons text-[18px] leading-none">chat</span>
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Message in Messenger</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Uses Messenger link for direct chat</p>
              </div>
            </div>
            <span className="material-icons text-slate-300">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupportContactSheet;
