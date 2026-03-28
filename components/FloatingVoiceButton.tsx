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
const EDGE_GAP = 18;

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

const FloatingVoiceButton: React.FC<Props> = ({
  active = false,
  disabled = false,
  label = 'Voice',
  title,
  onActivate
}) => {
  const { settings } = useApp();
  const [position, setPosition] = useState(getDefaultPosition);
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
      setPosition(current => ({
        x: clamp(current.x, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - BUTTON_SIZE - EDGE_GAP)),
        y: clamp(current.y, EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - EDGE_GAP))
      }));
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

    setPosition({
      x: clamp(dragState.originX + deltaX, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - BUTTON_SIZE - EDGE_GAP)),
      y: clamp(dragState.originY + deltaY, EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - EDGE_GAP))
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;

    if (!dragState.moved && !disabled) {
      onActivate();
    }
  };

  if (!settings.floatingVoiceEnabled) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragStateRef.current = null;
      }}
      className={`fixed z-[95] flex h-[68px] w-[68px] items-center justify-center rounded-full border-4 shadow-2xl transition-transform active:scale-95 ${
        active
          ? 'border-white bg-primary text-white'
          : 'border-white bg-[#0f172a] text-white dark:border-night-charcoal dark:bg-white dark:text-night-charcoal'
      } ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-grab'}`}
      style={{ left: position.x, top: position.y }}
    >
      <span className="material-icons text-[30px] leading-none">
        {active ? 'mic' : 'mic_none'}
      </span>
    </button>
  );
};

export default FloatingVoiceButton;
