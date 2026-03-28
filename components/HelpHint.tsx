import React, { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  children?: React.ReactNode;
  triggerClassName?: string;
  align?: 'left' | 'right';
}

const HelpHint: React.FC<Props> = ({
  label,
  children,
  triggerClassName,
  align = 'left'
}) => {
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

  const handleToggle = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(current => !current);
  };

  const handleClose = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  };

  const popupAlignmentClass = align === 'right' ? 'right-0' : 'left-0';

  return (
    <span ref={wrapperRef} className="relative inline-flex max-w-full">
      <span
        role="button"
        tabIndex={0}
        aria-label="How this works"
        onClick={handleToggle}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            handleToggle(event);
          }
        }}
        className={
          triggerClassName ??
          'inline-flex cursor-help items-center rounded-md text-[11px] font-black text-primary underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
        }
      >
        {children ?? 'How it works'}
      </span>
      {open && (
        <span
          role="button"
          tabIndex={0}
          onClick={handleClose}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              handleToggle(event);
            }
          }}
          className={`absolute top-[calc(100%+8px)] z-[210] w-[min(16rem,calc(100vw-2rem))] rounded-2xl bg-slate-900 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-white shadow-2xl outline-none dark:bg-night-charcoal ${popupAlignmentClass}`}
        >
          {label}
        </span>
      )}
    </span>
  );
};

export default HelpHint;
