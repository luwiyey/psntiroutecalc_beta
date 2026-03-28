import React, { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
}

const HelpHint: React.FC<Props> = ({ label }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="How this works"
        onClick={() => setOpen(current => !current)}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-all active:scale-95 dark:border-white/10 dark:bg-black/40 dark:text-slate-300"
      >
        <span className="material-icons text-sm leading-none">help_outline</span>
      </button>
      {open && (
        <span className="absolute right-0 top-8 z-[210] w-60 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-semibold leading-relaxed text-white shadow-2xl dark:bg-night-charcoal">
          {label}
        </span>
      )}
    </span>
  );
};

export default HelpHint;
