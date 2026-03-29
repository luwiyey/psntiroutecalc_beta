import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

interface Props {
  active?: boolean;
  disabled?: boolean;
  label?: string;
  title?: string;
  onActivate: () => void;
}

const BUTTON_SIZE = 68;
const EDGE_GAP = 8;
const DROP_ZONE_SIZE = 88;
const DROP_ZONE_BOTTOM_GAP = 24;
const STORAGE_KEY = 'psnti_floating_voice_position_v1';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getDefaultPosition = () => {
  if (typeof window === 'undefined') {
    return { x: EDGE_GAP, y: EDGE_GAP };
  }

  return {
    x: Math.max(EDGE_GAP, window.innerWidth - BUTTON_SIZE - EDGE_GAP),
    y: Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - 140)
  };
};

const getStoredPosition = () => {
  if (typeof window === 'undefined') {
    return getDefaultPosition();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultPosition();
    const parsed = JSON.parse(raw) as { x?: number; y?: number };

    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
      return getDefaultPosition();
    }

    return {
      x: clamp(parsed.x ?? EDGE_GAP, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - BUTTON_SIZE - EDGE_GAP)),
      y: clamp(parsed.y ?? EDGE_GAP, EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - EDGE_GAP))
    };
  } catch {
    return getDefaultPosition();
  }
};

const persistPosition = (position: { x: number; y: number }) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Ignore storage issues; dragging should still work.
  }
};

const isInsideDisableZone = (position: { x: number; y: number }) => {
  if (typeof window === 'undefined') return false;

  const bubbleCenterX = position.x + BUTTON_SIZE / 2;
  const bubbleCenterY = position.y + BUTTON_SIZE / 2;
  const zoneLeft = (window.innerWidth - DROP_ZONE_SIZE) / 2;
  const zoneTop = window.innerHeight - DROP_ZONE_SIZE - DROP_ZONE_BOTTOM_GAP;

  return (
    bubbleCenterX >= zoneLeft &&
    bubbleCenterX <= zoneLeft + DROP_ZONE_SIZE &&
    bubbleCenterY >= zoneTop &&
    bubbleCenterY <= zoneTop + DROP_ZONE_SIZE
  );
};

const FloatingVoiceButton: React.FC<Props> = ({
  active = false,
  disabled = false,
  label = 'Voice',
  title,
  onActivate
}) => {
  const { settings, setSettings, showToast } = useApp();
  const [position, setPosition] = useState(getStoredPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isOverDisableZone, setIsOverDisableZone] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setPosition(current => {
        const nextPosition = {
          x: clamp(current.x, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - BUTTON_SIZE - EDGE_GAP)),
          y: clamp(current.y, EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - EDGE_GAP))
        };
        persistPosition(nextPosition);
        return nextPosition;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false
    };
    setIsDragging(true);
    setIsOverDisableZone(false);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || disabled) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragState.moved = true;
    }

    const nextPosition = {
      x: clamp(dragState.originX + deltaX, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - BUTTON_SIZE - EDGE_GAP)),
      y: clamp(dragState.originY + deltaY, EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - EDGE_GAP))
    };

    setPosition(nextPosition);
    setIsOverDisableZone(isInsideDisableZone(nextPosition));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
    setIsDragging(false);

    if (isInsideDisableZone(position)) {
      setIsOverDisableZone(false);
      setSettings(prev => ({ ...prev, floatingVoiceEnabled: false }));
      showToast('Voice assistant bubble disabled. Re-enable it in Setup.', 'info');
      return;
    }

    persistPosition(position);
    setIsOverDisableZone(false);

    if (!dragState.moved && !disabled) {
      onActivate();
    }
  };

  if (!settings.floatingVoiceEnabled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={title ?? label}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStateRef.current = null;
          setIsDragging(false);
          setIsOverDisableZone(false);
        }}
        className={`fixed z-[95] flex h-[68px] w-[68px] items-center justify-center rounded-full shadow-2xl transition-transform active:scale-95 ${
          active
            ? 'bg-primary text-white'
            : 'bg-[#0f172a] text-white dark:bg-white dark:text-night-charcoal'
        } ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-grab'}`}
        style={{ left: position.x, top: position.y, touchAction: 'none' }}
      >
        <span className="material-icons text-[30px] leading-none">
          {active ? 'mic' : 'mic_none'}
        </span>
      </button>
      {isDragging && (
        <div
          className="pointer-events-none fixed left-1/2 z-[94] flex -translate-x-1/2 items-center justify-center rounded-full border-4 shadow-xl transition-all"
          style={{
            width: DROP_ZONE_SIZE,
            height: DROP_ZONE_SIZE,
            bottom: `calc(env(safe-area-inset-bottom) + ${DROP_ZONE_BOTTOM_GAP}px)`
          }}
        >
          <div
            className={`flex h-full w-full items-center justify-center rounded-full ${
              isOverDisableZone
                ? 'border-primary bg-primary text-white'
                : 'border-slate-300 bg-white/95 text-slate-500 dark:border-white/20 dark:bg-black/80 dark:text-slate-300'
            } border-4`}
          >
            <span className="material-icons text-[34px]">close</span>
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingVoiceButton;
