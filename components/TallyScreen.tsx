import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { TallyTrip, TallySheet, TallySession } from '../types';
import { calculateFare } from '../utils/fare';
import FloatingVoiceButton from './FloatingVoiceButton';
import HelpHint from './HelpHint';
import TallyCalcOverlay from './TallyCalcOverlay';
import type {
  BrowserSpeechRecognition,
  TallyNavigationVoiceParseResult
} from '../utils/voice';
import {
  cancelVoiceReply,
  formatVoiceConfidence,
  getSpeechRecognitionCtor,
  getSpeechRecognitionErrorMessage,
  parseBatchCountVoiceTranscript,
  parseShiftVoiceCommand,
  parseTallyBatchFollowUpTranscript,
  parseTallyNavigationVoiceTranscript,
  speakVoiceReply
} from '../utils/voice';
import { trackAnalyticsEvent } from '../utils/analytics';

type EditorMode = 'standard' | 'batch';
type PendingActionType =
  | 'trip'
  | 'sheet'
  | 'delete-sheet'
  | 'reset-block'
  | 'flip-direction'
  | 'reset-batch'
  | 'batch-typing-help'
  | 'finalize-session';

interface Props {
  onExit?: () => void;
}

const peso = '\u20B1';
const SLOTS_PER_BLOCK = 25;
const SLOTS_PER_SHEET = 100;

type PendingVoiceNavigationAction = Extract<TallyNavigationVoiceParseResult, { status: 'match' }>;
type TallyVoiceStep = 'command' | 'batch-follow-up';

const clampSlotIndex = (slotIdx: number) => Math.max(0, Math.min(slotIdx, SLOTS_PER_SHEET - 1));

const getFirstEmptySlotIndex = (slots: number[]) => {
  const nextEmptySlot = slots.findIndex(slot => slot === 0);
  return nextEmptySlot === -1 ? 0 : nextEmptySlot;
};

const getPreferredSlotIndexForBlock = (slots: number[], blockIdx: number) => {
  const safeBlockIdx = Math.max(0, Math.min(blockIdx, Math.floor(SLOTS_PER_SHEET / SLOTS_PER_BLOCK) - 1));
  const blockStart = safeBlockIdx * SLOTS_PER_BLOCK;
  const blockSlice = slots.slice(blockStart, blockStart + SLOTS_PER_BLOCK);
  const nextEmptyOffset = blockSlice.findIndex(slot => slot === 0);

  return nextEmptyOffset === -1 ? blockStart : blockStart + nextEmptyOffset;
};

const TallyScreen: React.FC<Props> = ({ onExit }) => {
  const { activeRoute, sessions, setSessions, tallyNav, setTallyNav, history, currentShift, startShift, endShift, showToast } = useApp();
  const { authState } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceRestartTimeoutRef = useRef<number | null>(null);

  const routeSessions = useMemo(
    () =>
      [...sessions]
        .filter(session => session.routeId === activeRoute.id)
        .sort((left, right) => Date.parse(right.date) - Date.parse(left.date)),
    [activeRoute.id, sessions]
  );
  const openRouteSessions = useMemo(
    () => routeSessions.filter(session => session.status !== 'closed'),
    [routeSessions]
  );
  const activeShiftSession = useMemo(
    () =>
      currentShift?.routeId === activeRoute.id
        ? routeSessions.find(session => session.shiftId === currentShift.id) ?? null
        : null,
    [activeRoute.id, currentShift, routeSessions]
  );
  const fallbackSession = useMemo<TallySession>(() => ({
    id: `pending-${activeRoute.id}`,
    date: new Date().toISOString(),
    status: 'open',
    routeId: activeRoute.id,
    routeLabel: activeRoute.label,
    shiftId: currentShift?.routeId === activeRoute.id ? currentShift.id : null,
    trips: [{
      id: `pending-trip-${activeRoute.id}`,
      name: 'Trip 1',
      direction: 'north',
      sheets: [{
        id: `pending-sheet-${activeRoute.id}`,
        slots: Array(100).fill(0),
        status: 'in-progress',
        lastUpdatedAt: Date.now()
      }]
    }]
  }), [activeRoute.id, activeRoute.label, currentShift]);
  const activeSession =
    activeShiftSession ||
    openRouteSessions.find(s => s.id === tallyNav.sessionId) ||
    openRouteSessions[0] ||
    fallbackSession;

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('standard');
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number>(0);
  const [stagedStandardEntries, setStagedStandardEntries] = useState<number[]>([]);
  const [editValue, setEditValue] = useState('');
  const [isFlashing, setIsFlashing] = useState(false);
  const [lastPunched, setLastPunched] = useState<number | null>(null);
  const [batchCounts, setBatchCounts] = useState<Record<number, string>>({});
  const [batchSearch, setBatchSearch] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [isFooterCollapsed, setIsFooterCollapsed] = useState(true);
  const [isTallyCalcOpen, setIsTallyCalcOpen] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const [pendingVoiceNavAction, setPendingVoiceNavAction] = useState<PendingVoiceNavigationAction | null>(null);
  const [tallyVoiceStep, setTallyVoiceStep] = useState<TallyVoiceStep>('command');
  const [isEntryTapeExpanded, setIsEntryTapeExpanded] = useState(false);
  const [isCurrentEntryCollapsed, setIsCurrentEntryCollapsed] = useState(false);
  const canUseVoiceRecognition = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);
  
  const [blockAlert, setBlockAlert] = useState<{ completedBlock: number, nextBlock: number } | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: PendingActionType; blockIdx?: number; sheetIdx?: number } | null>(null);
  const northboundTerminal = activeRoute.stops[activeRoute.stops.length - 1]?.name ?? 'North';
  const southboundTerminal = activeRoute.stops[0]?.name ?? 'South';
  const routeKms = useMemo(
    () => [...activeRoute.stops.map(stop => stop.km)].sort((a, b) => a - b),
    [activeRoute.stops]
  );

  const routeDistanceRange = useMemo(() => {
    return routeKms[routeKms.length - 1] - routeKms[0];
  }, [routeKms]);
  const minimumSegmentDistance = useMemo(() => {
    return routeKms.slice(1).reduce((smallest, km, index) => {
      const gap = km - routeKms[index];
      if (gap <= 0) return smallest;
      return Math.min(smallest, gap);
    }, Number.POSITIVE_INFINITY);
  }, [routeKms]);
  const fareBounds = useMemo(() => {
    const baseDistance = Number.isFinite(minimumSegmentDistance) ? minimumSegmentDistance : 1;
    const minimumFareCalc = calculateFare(baseDistance, activeRoute.fare);
    const minimumFare = Math.min(minimumFareCalc.reg, minimumFareCalc.disc);
    const maximumFare = calculateFare(routeDistanceRange, activeRoute.fare).reg;

    return {
      minimumFare,
      minimumRegularFare: minimumFareCalc.reg,
      minimumDiscountFare: minimumFareCalc.disc,
      maximumFare
    };
  }, [activeRoute.fare, minimumSegmentDistance, routeDistanceRange]);
  const learnedFareCounts = useMemo(() => {
    const counts = new Map<number, number>();

    sessions
      .filter(session => session.routeId === activeRoute.id)
      .forEach(session => {
        session.trips.forEach(trip => {
          trip.sheets.forEach(sheet => {
            sheet.slots.forEach(slot => {
              if (slot > 0) counts.set(slot, (counts.get(slot) ?? 0) + 1);
            });
          });
        });
      });

    history
      .filter(record => record.routeId === activeRoute.id)
      .forEach(record => {
        if (record.regularFare > 0) counts.set(record.regularFare, (counts.get(record.regularFare) ?? 0) + 1);
        if (record.discountedFare > 0) counts.set(record.discountedFare, (counts.get(record.discountedFare) ?? 0) + 1);
      });

    return counts;
  }, [activeRoute.id, history, sessions]);
  const smartQuickFares = useMemo(() => {
    const pinned = Array.from(
      new Set(
        [fareBounds.minimumDiscountFare, fareBounds.minimumRegularFare].filter(
          (fare): fare is number => typeof fare === 'number' && fare > 0
        )
      )
    ).sort((a, b) => a - b);
    const midStart = pinned[pinned.length - 1] ?? fareBounds.minimumFare;
    const fallbackMiddle = Array.from({ length: 5 }, (_, index) => midStart + (index + 1) * 2);
    const fallbackTop = [
      Math.max(fareBounds.minimumFare, fareBounds.maximumFare - 1),
      fareBounds.maximumFare
    ];
    const learned = [...learnedFareCounts.entries()]
      .filter(([fare]) => fare >= fareBounds.minimumFare && fare <= fareBounds.maximumFare && !pinned.includes(fare))
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([fare]) => fare);
    const result: number[] = [];

    [...pinned, ...learned, ...fallbackMiddle, ...fallbackTop].forEach(fare => {
      if (
        fare >= fareBounds.minimumFare &&
        fare <= fareBounds.maximumFare &&
        !result.includes(fare) &&
        result.length < 9
      ) {
        result.push(fare);
      }
    });

    return result;
  }, [fareBounds.maximumFare, fareBounds.minimumFare, fareBounds.minimumDiscountFare, fareBounds.minimumRegularFare, learnedFareCounts]);
  const allBatchFares = useMemo(() => {
    return Array.from(
      { length: fareBounds.maximumFare - fareBounds.minimumFare + 1 },
      (_, i) => i + fareBounds.minimumFare
    );
  }, [fareBounds.maximumFare, fareBounds.minimumFare]);
  const batchFilterPresets = useMemo(() => {
    const highestFare = allBatchFares[allBatchFares.length - 1];
    return [
      { label: 'ALL', value: '' },
      { label: `${fareBounds.minimumFare}-39`, value: `${fareBounds.minimumFare}-39` },
      { label: '40-79', value: '40-79' },
      { label: '80-149', value: '80-149' },
      { label: '150+', value: `150-${highestFare}` }
    ];
  }, [allBatchFares, fareBounds.minimumFare]);

  useEffect(() => {
    if (currentShift?.routeId === activeRoute.id) return;
    if (openRouteSessions.length > 0) return;

    setSessions(prev => {
      if (prev.some(session => session.id === fallbackSession.id)) {
        return prev;
      }

      return [fallbackSession, ...prev];
    });

    setTallyNav(prev =>
      prev.sessionId === fallbackSession.id
        ? prev
        : {
            sessionId: fallbackSession.id,
            tripIdx: 0,
            sheetIdx: 0,
            blockIdx: 0
          }
    );
  }, [
    activeRoute.id,
    currentShift,
    fallbackSession,
    openRouteSessions.length,
    setSessions,
    setTallyNav
  ]);

  useEffect(() => {
    if (routeSessions.length === 0) return;

    if (tallyNav.sessionId !== activeSession.id) {
      setTallyNav({
        sessionId: activeSession.id,
        tripIdx: 0,
        sheetIdx: 0,
        blockIdx: 0
      });
    }
  }, [activeSession.id, routeSessions.length, setTallyNav, tallyNav.sessionId]);

  useEffect(() => {
    if (editorMode !== 'batch') return;
    setEditValue('');
    inputRef.current?.blur();
  }, [editorMode]);

  useEffect(() => {
    if (isEditorOpen) return;
    setIsVoiceListening(false);
    setVoiceTranscript('');
    setVoiceFeedback(null);
    setVoiceConfidence(null);
    setPendingVoiceNavAction(null);
    setTallyVoiceStep('command');
    if (voiceRestartTimeoutRef.current !== null) {
      window.clearTimeout(voiceRestartTimeoutRef.current);
      voiceRestartTimeoutRef.current = null;
    }
    cancelVoiceReply();
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
  }, [isEditorOpen]);

  useEffect(() => {
    return () => {
      if (voiceRestartTimeoutRef.current !== null) {
        window.clearTimeout(voiceRestartTimeoutRef.current);
        voiceRestartTimeoutRef.current = null;
      }
      cancelVoiceReply();
      voiceRecognitionRef.current?.abort();
      voiceRecognitionRef.current = null;
    };
  }, []);

  const activeTrip = activeSession.trips[tallyNav.tripIdx] || activeSession.trips[0];
  const activeSheet = activeTrip.sheets[tallyNav.sheetIdx] || activeTrip.sheets[0];

  const setEditorTargetSlot = (slotIdx: number) => {
    const nextSlotIdx = clampSlotIndex(slotIdx);
    setSelectedSlotIdx(nextSlotIdx);
    setTallyNav(prev => ({ ...prev, blockIdx: Math.floor(nextSlotIdx / SLOTS_PER_BLOCK) }));
  };

  const jumpToBlock = (blockIdx: number) => {
    setEditorTargetSlot(getPreferredSlotIndexForBlock(activeSheet.slots, blockIdx));
  };

  const finalizeDraftAndJumpToBlock = (blockIdx: number) => {
    const safeBlockIdx = Math.max(0, Math.min(blockIdx, Math.floor(SLOTS_PER_SHEET / SLOTS_PER_BLOCK) - 1));

    if (pendingEntriesPreview.length > 0) {
      const savedBlockNumber = Math.floor(selectedSlotIdx / SLOTS_PER_BLOCK) + 1;
      const didPersist = persistEntriesToSheet([...pendingEntriesPreview], {
        closeEditor: false,
        autoAdvanceWhenFull: false,
        successMessage: `Block ${savedBlockNumber} saved. Now on Block ${safeBlockIdx + 1}`
      });

      if (!didPersist) {
        return;
      }
    }

    jumpToBlock(safeBlockIdx);
    setBlockAlert(null);
  };
  
  const filteredBatchFares = useMemo(() => {
    let fares = allBatchFares;

    if (batchSearch) {
      if (batchSearch.includes('-')) {
        const [start, end] = batchSearch.split('-').map(v => parseInt(v.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          fares = fares.filter(f => f >= start && f <= end);
        }
      } else {
        fares = fares.filter(f => f.toString().includes(batchSearch));
      }
    }

    if (showOnlySelected) {
      fares = fares.filter(f => (parseInt(batchCounts[f]) || 0) > 0);
    }

    return fares;
  }, [batchSearch, allBatchFares, showOnlySelected, batchCounts]);

  const blockTotals = useMemo(() => {
    return [0, 1, 2, 3].map(blockIdx => {
      const slice = activeSheet.slots.slice(blockIdx * SLOTS_PER_BLOCK, (blockIdx + 1) * SLOTS_PER_BLOCK);
      return slice.reduce((a, b) => a + b, 0);
    });
  }, [activeSheet]);

  const blockCounts = useMemo(() => {
    return [0, 1, 2, 3].map(blockIdx => {
      const slice = activeSheet.slots.slice(blockIdx * SLOTS_PER_BLOCK, (blockIdx + 1) * SLOTS_PER_BLOCK);
      return slice.filter(v => v > 0).length;
    });
  }, [activeSheet]);

  const sheetTotal = useMemo(() => activeSheet.slots.reduce((a, b) => a + b, 0), [activeSheet]);
  const sheetEntryCount = useMemo(() => activeSheet.slots.filter(v => v > 0).length, [activeSheet]);
  const tripTotal = useMemo(
    () =>
      activeTrip.sheets.reduce(
        (tripGross, sheet) => tripGross + sheet.slots.reduce((sheetGross, slot) => sheetGross + slot, 0),
        0
      ),
    [activeTrip]
  );

  const batchTotalGross = useMemo(() => {
    return (Object.entries(batchCounts) as [string, string][]).reduce((sum: number, [fare, count]) => {
      const qty = parseInt(count) || 0;
      return sum + (parseInt(fare) * qty);
    }, 0);
  }, [batchCounts]);

  const stagedTotalGross = useMemo(() => stagedStandardEntries.reduce((a, b) => a + b, 0), [stagedStandardEntries]);
  const currentTypingValue = editorMode === 'standard' ? parseInt(editValue) || 0 : 0;
  const grandTotalInEditor = useMemo(() => stagedTotalGross + batchTotalGross + currentTypingValue, [stagedTotalGross, batchTotalGross, currentTypingValue]);
  const pendingEntriesPreview = useMemo(() => {
    const previewEntries = [...stagedStandardEntries];
    if (currentTypingValue > 0) previewEntries.push(currentTypingValue);
    (Object.entries(batchCounts) as [string, string][])
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .forEach(([fare, count]) => {
        const qty = parseInt(count) || 0;
        for (let i = 0; i < qty; i++) previewEntries.push(parseInt(fare));
      });
    return previewEntries;
  }, [batchCounts, currentTypingValue, stagedStandardEntries]);
  const selectedBatchItems = useMemo(
    () =>
      (Object.entries(batchCounts) as [string, string][])
        .map(([fare, count]) => [parseInt(fare), parseInt(count) || 0] as const)
        .filter(([, count]) => count > 0)
        .sort((a, b) => a[0] - b[0]),
    [batchCounts]
  );
  const projectedSlots = useMemo(() => {
    if (pendingEntriesPreview.length === 0) return activeSheet.slots;
    return activeSheet.slots.map((slot, idx) => {
      const offset = idx - selectedSlotIdx;
      if (offset >= 0 && offset < pendingEntriesPreview.length) return pendingEntriesPreview[offset];
      return slot;
    });
  }, [activeSheet.slots, pendingEntriesPreview, selectedSlotIdx]);
  const projectedBlockTotals = useMemo(() => {
    return [0, 1, 2, 3].map(blockIdx => {
      const slice = projectedSlots.slice(blockIdx * SLOTS_PER_BLOCK, (blockIdx + 1) * SLOTS_PER_BLOCK);
      return slice.reduce((sum, value) => sum + value, 0);
    });
  }, [projectedSlots]);
  const projectedBlockCounts = useMemo(() => {
    return [0, 1, 2, 3].map(blockIdx => {
      const slice = projectedSlots.slice(blockIdx * SLOTS_PER_BLOCK, (blockIdx + 1) * SLOTS_PER_BLOCK);
      return slice.filter(value => value > 0).length;
    });
  }, [projectedSlots]);
  const projectedSheetTotal = useMemo(() => projectedSlots.reduce((sum, value) => sum + value, 0), [projectedSlots]);
  const projectedSheetEntryCount = useMemo(() => projectedSlots.filter(value => value > 0).length, [projectedSlots]);
  
  const currentTargetSlot = selectedSlotIdx + stagedStandardEntries.length;
  const selectedSlotNumber = selectedSlotIdx + 1;
  const currentSlotNumber = Math.min(currentTargetSlot + 1, SLOTS_PER_SHEET);
  const nextSlotNumber = currentSlotNumber >= SLOTS_PER_SHEET ? null : currentSlotNumber + 1;
  const currentSlotBlock = Math.floor((currentSlotNumber - 1) / SLOTS_PER_BLOCK) + 1;
  const nextSlotBlock = nextSlotNumber ? Math.floor((nextSlotNumber - 1) / SLOTS_PER_BLOCK) + 1 : null;
  const auditBlockIdx = currentSlotBlock - 1;
  const blockPendingTotal = projectedBlockTotals[auditBlockIdx] - blockTotals[auditBlockIdx];
  const sheetPendingTotal = projectedSheetTotal - sheetTotal;
  const blockSlotsLeft = Math.max(0, SLOTS_PER_BLOCK - projectedBlockCounts[auditBlockIdx]);
  const sheetSlotsLeft = Math.max(0, SLOTS_PER_SHEET - projectedSheetEntryCount);
  const previewEntryCount = pendingEntriesPreview.length;
  const previewEndSlotNumber =
    previewEntryCount > 0 ? Math.min(selectedSlotIdx + previewEntryCount, SLOTS_PER_SHEET) : currentSlotNumber;
  const hasPreviousTargetSlot = selectedSlotIdx > 0 || stagedStandardEntries.length > 0;
  const hasNextTargetSlot = selectedSlotIdx < SLOTS_PER_SHEET - 1;
  const hasNextBlock = currentSlotBlock < SLOTS_PER_SHEET / SLOTS_PER_BLOCK;
  const compactCurrentBoxLabel = `B${currentSlotBlock} - Slot ${currentSlotNumber}`;
  const compactNextBoxLabel = nextSlotNumber ? `B${nextSlotBlock} - Slot ${nextSlotNumber}` : 'Sheet Full';
  const currentBoxLabel = `Block ${currentSlotBlock} • Slot ${currentSlotNumber}`;
  const nextBoxLabel = nextSlotNumber ? `Block ${nextSlotBlock} • Slot ${nextSlotNumber}` : 'Sheet Full';
  const collapsedCurrentEntryTitle = `${compactCurrentBoxLabel} | Trip ${tallyNav.tripIdx + 1} | Sheet ${tallyNav.sheetIdx + 1}`;
  const standardTapeSummary =
    stagedStandardEntries.length > 0
      ? `Last ${Math.min(3, stagedStandardEntries.length)}: ${stagedStandardEntries.slice(-3).map(fare => `${peso}${fare}`).join(' / ')}`
      : currentTypingValue > 0
        ? `Typing ${peso}${currentTypingValue}`
        : 'No staged fares yet.';
  const batchTapeSummary =
    selectedBatchItems.length > 0
      ? selectedBatchItems.slice(0, 3).map(([fare, count]) => `${count} x ${peso}${fare}`).join(' / ')
      : 'No batch fares selected yet.';
  const currentTripLabel = `${activeTrip.name} • Sheet ${tallyNav.sheetIdx + 1}`;
  const blockSlotsLeftLabel =
    blockSlotsLeft === 1 ? '1 slot left in this block' : `${blockSlotsLeft} slots left in this block`;
  const remainingSlotsSummary = `${blockSlotsLeft} left in block • ${sheetSlotsLeft} left in sheet`;
  const collapsedRemainingSlotsSummary = `${blockSlotsLeft} left in block / ${sheetSlotsLeft} left in sheet`;
  const displayedPunchAmount =
    editorMode === 'batch'
      ? batchTotalGross
      : isFlashing
        ? lastPunched ?? 0
        : currentTypingValue > 0
          ? currentTypingValue
          : stagedStandardEntries[stagedStandardEntries.length - 1] ?? 0;

  const handleAddTrip = () => {
    const lastTrip = activeSession.trips[activeSession.trips.length - 1];
    const nextDir = lastTrip.direction === 'north' ? 'south' : 'north';
    const nextTripNum = activeSession.trips.length + 1;
    const newTrip: TallyTrip = {
      id: `trip-${Date.now()}`,
      name: `Trip ${nextTripNum}`,
      direction: nextDir,
      sheets: [{ id: `sheet-${Date.now()}`, slots: Array(100).fill(0), status: 'in-progress', lastUpdatedAt: Date.now() }]
    };
    setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, trips: [...s.trips, newTrip] } : s));
    setTallyNav(n => ({ ...n, tripIdx: activeSession.trips.length, sheetIdx: 0, blockIdx: 0 }));
    setPendingAction(null);
    showToast(`Trip ${nextTripNum} set to ${nextDir === 'north' ? northboundTerminal : southboundTerminal}`);
  };

  const handleAddSheet = () => {
    const newSheet: TallySheet = { id: `sheet-${Date.now()}`, slots: Array(100).fill(0), status: 'in-progress', lastUpdatedAt: Date.now() };
    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s, trips: s.trips.map((t, ti) => ti === tallyNav.tripIdx ? { ...t, sheets: [...t.sheets, newSheet] } : t)
    } : s));
    const newSheetIdx = activeTrip.sheets.length;
    setTallyNav(n => ({ ...n, sheetIdx: newSheetIdx, blockIdx: 0 }));
    setSelectedSlotIdx(0);
    setStagedStandardEntries([]);
    setEditValue('');
    setBatchCounts({});
    setPendingAction(null);
    showToast(`Sheet ${newSheetIdx + 1} added`);
  };

  const handleDeleteSheet = (sheetIdxToDelete: number) => {
    if (activeTrip.sheets.length <= 1) {
      showToast('At least one sheet must remain', 'info');
      setPendingAction(null);
      return;
    }

    const deletedSheetNumber = sheetIdxToDelete + 1;
    const nextSheetCount = activeTrip.sheets.length - 1;
    const nextActiveSheetIdx = Math.min(sheetIdxToDelete, nextSheetCount - 1);

    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s,
      trips: s.trips.map((t, ti) =>
        ti === tallyNav.tripIdx
          ? { ...t, sheets: t.sheets.filter((_, si) => si !== sheetIdxToDelete) }
          : t
      )
    } : s));

    setTallyNav(n => ({ ...n, sheetIdx: nextActiveSheetIdx, blockIdx: 0 }));
    setSelectedSlotIdx(0);
    resetEditorDraft();
    setIsEditorOpen(false);
    setPendingAction(null);
    showToast(`Sheet ${deletedSheetNumber} deleted`);
  };

  const handleFlipDirection = () => {
    const nextDir = activeTrip.direction === 'north' ? 'south' : 'north';
    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s, trips: s.trips.map((t, ti) => ti === tallyNav.tripIdx ? { ...t, direction: nextDir } : t)
    } : s));
    setPendingAction(null);
    showToast(`Heading to ${nextDir === 'north' ? northboundTerminal : southboundTerminal}`, 'info');
  };

  const handleResetBlock = (bIdx: number) => {
    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s, trips: s.trips.map((t, ti) => ti === tallyNav.tripIdx ? {
        ...t, sheets: t.sheets.map((sh, si) => si === tallyNav.sheetIdx ? {
          ...sh, slots: sh.slots.map((sl, sli) => (sli >= bIdx * SLOTS_PER_BLOCK && sli < (bIdx + 1) * SLOTS_PER_BLOCK) ? 0 : sl), lastUpdatedAt: Date.now()
        } : sh)
      } : t)
    } : s));
    setPendingAction(null);
    showToast(`Block B${bIdx + 1} cleared`);
  };

  const resetEditorDraft = () => {
    setStagedStandardEntries([]);
    setEditValue('');
    setBatchCounts({});
    setBatchSearch('');
    setShowOnlySelected(false);
    setIsFlashing(false);
    setLastPunched(null);
    setBlockAlert(null);
    setIsFooterCollapsed(true);
    setIsEntryTapeExpanded(false);
  };

  const openNextSheet = (savedSheetNumber: number) => {
    const nextExistingSheetIdx = activeTrip.sheets.findIndex(
      (sheet, idx) => idx > tallyNav.sheetIdx && sheet.slots.some(slot => slot === 0)
    );

    if (nextExistingSheetIdx !== -1) {
      const nextExistingSheet = activeTrip.sheets[nextExistingSheetIdx];
      const nextOpenSlotIdx = nextExistingSheet.slots.findIndex(slot => slot === 0);
      const nextBlockIdx = Math.floor((nextOpenSlotIdx === -1 ? 0 : nextOpenSlotIdx) / SLOTS_PER_BLOCK);

      setTallyNav(n => ({ ...n, sheetIdx: nextExistingSheetIdx, blockIdx: nextBlockIdx }));
      setSelectedSlotIdx(nextOpenSlotIdx === -1 ? 0 : nextOpenSlotIdx);
      resetEditorDraft();
      setIsEditorOpen(true);
      showToast(`Sheet ${savedSheetNumber} saved. Now on Sheet ${nextExistingSheetIdx + 1}`);
      return;
    }

    const newSheet: TallySheet = {
      id: `sheet-${Date.now()}`,
      slots: Array(100).fill(0),
      status: 'in-progress',
      lastUpdatedAt: Date.now()
    };

    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s,
      trips: s.trips.map((t, ti) => ti === tallyNav.tripIdx ? { ...t, sheets: [...t.sheets, newSheet] } : t)
    } : s));

    const nextSheetIdx = activeTrip.sheets.length;
    setTallyNav(n => ({ ...n, sheetIdx: nextSheetIdx, blockIdx: 0 }));
    setSelectedSlotIdx(0);
    resetEditorDraft();
    setIsEditorOpen(true);
    showToast(`Sheet ${savedSheetNumber} saved. Now on Sheet ${savedSheetNumber + 1}`);
  };

  const persistEntriesToSheet = (
    entries: number[],
    options?: {
      closeEditor?: boolean;
      autoAdvanceWhenFull?: boolean;
      successMessage?: string;
    }
  ) => {
    const remainingSlots = Math.max(0, SLOTS_PER_SHEET - selectedSlotIdx);
    const finalEntries = entries.slice(0, remainingSlots);
    if (finalEntries.length === 0) return false;

    const savedSheetNumber = tallyNav.sheetIdx + 1;
    const fillsSheet = selectedSlotIdx + finalEntries.length >= SLOTS_PER_SHEET;
    const nextSlotIdx = clampSlotIndex(selectedSlotIdx + finalEntries.length);
    const nextBlockIdx = Math.floor(nextSlotIdx / SLOTS_PER_BLOCK);
    const ensuredShift = startShift('auto', { silent: true });

    setSessions(prev => {
      const applyEntriesToSession = (session: TallySession): TallySession => ({
        ...session,
        shiftId:
          session.routeId === activeRoute.id
            ? ensuredShift?.id ?? session.shiftId ?? null
            : session.shiftId ?? null,
        trips: session.trips.map((trip, tripIdx) =>
          tripIdx === tallyNav.tripIdx
            ? {
                ...trip,
                sheets: trip.sheets.map((sheet, sheetIdx) =>
                  sheetIdx === tallyNav.sheetIdx
                    ? {
                        ...sheet,
                        slots: sheet.slots.map((slot, slotIdx) => {
                          const offset = slotIdx - selectedSlotIdx;
                          if (offset >= 0 && offset < finalEntries.length) {
                            return finalEntries[offset];
                          }
                          return slot;
                        }),
                        lastUpdatedAt: Date.now()
                      }
                    : sheet
                )
              }
            : trip
        )
      });

      const existingSessionIndex = prev.findIndex(session => session.id === activeSession.id);
      if (existingSessionIndex >= 0) {
        return prev.map((session, sessionIdx) =>
          sessionIdx === existingSessionIndex ? applyEntriesToSession(session) : session
        );
      }

      const workingSession = applyEntriesToSession({
        ...activeSession,
        shiftId:
          activeSession.routeId === activeRoute.id
            ? ensuredShift?.id ?? activeSession.shiftId ?? null
            : activeSession.shiftId ?? null
      });

      return [workingSession, ...prev];
    });

    void trackAnalyticsEvent({
      eventType: 'tally_saved',
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      routeId: activeRoute.id,
      routeLabel: activeRoute.label,
      appSurface: 'tally',
      metadata: {
        tripName: activeTrip.name,
        direction: activeTrip.direction,
        sheetNumber: savedSheetNumber,
        blockNumber: currentSlotBlock,
        startBox: selectedSlotIdx + 1,
        endBox: Math.min(selectedSlotIdx + finalEntries.length, SLOTS_PER_SHEET),
        entriesRecorded: finalEntries.length,
        totalAdded: finalEntries.reduce((sum, value) => sum + value, 0)
      }
    });

    if ((options?.autoAdvanceWhenFull ?? true) && fillsSheet) {
      openNextSheet(savedSheetNumber);
      return true;
    }

    resetEditorDraft();
    setSelectedSlotIdx(nextSlotIdx);
    setTallyNav(prev => ({
      ...prev,
      blockIdx: nextBlockIdx
    }));
    if (options?.closeEditor ?? true) {
      setIsEditorOpen(false);
    }
    showToast(options?.successMessage ?? `Waybill Updated: Recorded ${finalEntries.length} items`);
    return true;
  };

  const handleSlotClick = (idx: number) => {
    if (activeSheet.status === 'recorded' || activeSession.status === 'closed') return;
    setEditorTargetSlot(idx);
    resetEditorDraft();
    setIsEditorOpen(true);
  };

  const commitStandardEntry = (val: number, isTileClick = false) => {
    if (isNaN(val) || val <= 0) return;
    const nextEntries = [...stagedStandardEntries, val];
    const newTapeLength = nextEntries.length;
    const absoluteSlot = selectedSlotIdx + newTapeLength;

    if (absoluteSlot === SLOTS_PER_SHEET) {
      setLastPunched(val);
      setIsFlashing(true);
      persistEntriesToSheet(nextEntries, {
        closeEditor: false,
        autoAdvanceWhenFull: true
      });
      setTimeout(() => setIsFlashing(false), 150);
      return;
    }

    setLastPunched(val);
    setIsFlashing(true);
    setStagedStandardEntries(nextEntries);
    setEditValue('');
    if (absoluteSlot % SLOTS_PER_BLOCK === 0) {
      setBlockAlert({
        completedBlock: Math.floor(absoluteSlot / SLOTS_PER_BLOCK),
        nextBlock: Math.floor(absoluteSlot / SLOTS_PER_BLOCK) + 1
      });
    }
    setTimeout(() => setIsFlashing(false), 150);
    if (isTileClick) {
      inputRef.current?.blur();
    } else {
      inputRef.current?.focus();
    }
  };

  const handleConfirmAll = () => {
    persistEntriesToSheet([...pendingEntriesPreview], { closeEditor: true, autoAdvanceWhenFull: true });
  };

  const getTapeHighlight = (slotNum: number) => {
    const blockIdx = Math.floor((slotNum - 1) / SLOTS_PER_BLOCK);
    switch(blockIdx) {
      case 0: return 'bg-red-50 border-red-100 text-red-700 dark:bg-red-900/20 dark:border-red-700/50 dark:text-red-300';
      case 1: return 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700/50 dark:text-emerald-300';
      case 2: return 'bg-blue-50 border-blue-100 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700/50 dark:text-blue-300';
      case 3: return 'bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-300';
      default: return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

  const handleResetBatch = () => {
    if (Object.keys(batchCounts).length === 0 && !batchSearch && !showOnlySelected) return;
    setPendingAction({ type: 'reset-batch' });
  };

  const confirmResetBatch = () => {
    setBatchCounts({});
    setBatchSearch('');
    setShowOnlySelected(false);
    setPendingAction(null);
    showToast('Batch entries cleared', 'info');
  };

  const clearVoiceRestartTimer = () => {
    if (voiceRestartTimeoutRef.current !== null) {
      window.clearTimeout(voiceRestartTimeoutRef.current);
      voiceRestartTimeoutRef.current = null;
    }
  };

  const scheduleVoiceRestart = (nextStep: TallyVoiceStep) => {
    if (typeof window === 'undefined') return;
    clearVoiceRestartTimer();
    voiceRestartTimeoutRef.current = window.setTimeout(() => {
      voiceRestartTimeoutRef.current = null;
      startTallyNavigationVoice(nextStep, true);
    }, 320);
  };

  const queueTallyVoicePrompt = (message: string, nextStep: TallyVoiceStep, listenAfterSpeak = false) => {
    setVoiceFeedback(message);
    setTallyVoiceStep(nextStep);
    clearVoiceRestartTimer();
    cancelVoiceReply();

    if (!listenAfterSpeak) {
      return;
    }

    const started = speakVoiceReply(message, {
      onEnd: () => scheduleVoiceRestart(nextStep),
      onError: () => scheduleVoiceRestart(nextStep)
    });

    if (!started) {
      scheduleVoiceRestart(nextStep);
    }
  };

  const applyBatchVoiceCount = (quantity: number, fare: number) => {
    setEditorMode('batch');
    inputRef.current?.blur();
    setBatchCounts(prev => ({ ...prev, [fare]: String(quantity) }));
    setLastPunched(fare);

    const passengerLabel = `${quantity} passenger${quantity === 1 ? '' : 's'}`;
    const summary = `Set ${passengerLabel} at ${peso}${fare}.`;
    const nextPrompt =
      `${summary} Say another batch fare, say finalize to save the queued batch fares into the current sheet, or say exit.`;

    showToast(`Batch set: ${passengerLabel} x ${peso}${fare}`, 'success');
    queueTallyVoicePrompt(nextPrompt, 'batch-follow-up', true);
  };

  const handleRemoveStagedEntry = (entryIdx: number) => {
    setStagedStandardEntries(prev => prev.filter((_, idx) => idx !== entryIdx));
    setIsFlashing(false);
    setLastPunched(null);
    setBlockAlert(null);
    inputRef.current?.focus();
  };

  const handlePreviousTarget = () => {
    if (editorMode === 'standard' && stagedStandardEntries.length > 0) {
      handleRemoveStagedEntry(stagedStandardEntries.length - 1);
      return;
    }

    setEditorTargetSlot(selectedSlotIdx - 1);
  };

  const handlePunchBoxPress = () => {
    if (editorMode === 'batch') {
      setPendingAction({ type: 'batch-typing-help' });
      return;
    }

    inputRef.current?.focus();
  };

  const handleApplyCalcTotal = (value: number) => {
    setEditorMode('standard');
    setEditValue(Math.trunc(value).toString());
    setIsFlashing(false);
    setLastPunched(Math.trunc(value));
    inputRef.current?.focus();
  };

  const handleApplyCalcEntries = (values: number[]) => {
    if (values.length === 0) return;

    const remainingSlots = SLOTS_PER_SHEET - selectedSlotIdx - stagedStandardEntries.length;
    const acceptedValues = values.slice(0, Math.max(0, remainingSlots));

    if (acceptedValues.length === 0) {
      showToast('No empty boxes left for these entries');
      return;
    }

    setEditorMode('standard');
    const nextEntries = [...stagedStandardEntries, ...acceptedValues];
    setEditValue('');
    setIsFlashing(false);
    setLastPunched(acceptedValues[acceptedValues.length - 1] ?? null);

    if (selectedSlotIdx + nextEntries.length === SLOTS_PER_SHEET) {
      persistEntriesToSheet(nextEntries, {
        closeEditor: false,
        autoAdvanceWhenFull: true
      });
      return;
    } else {
      setStagedStandardEntries(nextEntries);
    }

    if (acceptedValues.length < values.length) {
      showToast(`Only ${acceptedValues.length} entries fit in the remaining boxes`);
    } else {
      showToast(`${acceptedValues.length} entries added from calculator`);
    }
  };

  const applyImmediateVoiceNavigation = (action: PendingVoiceNavigationAction) => {
    switch (action.command) {
      case 'previous-box':
        handlePreviousTarget();
        setVoiceFeedback('Moved to the previous box.');
        showToast('Moved to the previous box', 'info');
        break;
      case 'next-box':
        if (!hasNextTargetSlot) {
          setVoiceFeedback('There is no next box left on this sheet.');
          showToast('No next box left', 'info');
          break;
        }
        setEditorTargetSlot(selectedSlotIdx + 1);
        setVoiceFeedback('Moved to the next box.');
        showToast('Moved to the next box', 'info');
        break;
      case 'standard-mode':
        setEditorMode('standard');
        inputRef.current?.focus();
        setVoiceFeedback('Switched to Standard mode.');
        showToast('Switched to Standard mode', 'info');
        break;
      case 'batch-mode':
        setEditorMode('batch');
        inputRef.current?.blur();
        setVoiceFeedback('Switched to Batch.');
        showToast('Switched to Batch', 'info');
        break;
      case 'open-calculator':
        setIsTallyCalcOpen(true);
        setVoiceFeedback('Opened the tally calculator.');
        showToast('Opened the tally calculator', 'info');
        break;
      default:
        break;
    }
  };

  const confirmVoiceNavigation = () => {
    if (!pendingVoiceNavAction) return;

    if (pendingVoiceNavAction.command === 'next-block') {
      setPendingVoiceNavAction(null);
      finalizeDraftAndJumpToBlock(tallyNav.blockIdx + 1);
      return;
    }

    if (pendingVoiceNavAction.command === 'finalize-session') {
      setPendingVoiceNavAction(null);
      setPendingAction({ type: 'finalize-session' });
    }
  };

  const startTallyNavigationVoice = (requestedStep: TallyVoiceStep = tallyVoiceStep, fromAutoPrompt = false) => {
    if (isVoiceListening) {
      if (fromAutoPrompt) return;
      clearVoiceRestartTimer();
      cancelVoiceReply();
      voiceRecognitionRef.current?.stop();
      setTallyVoiceStep('command');
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setVoiceFeedback('Voice command is not available in this browser. Use Chrome on Android for the best result.');
      return;
    }

    clearVoiceRestartTimer();
    cancelVoiceReply();
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setTallyVoiceStep(requestedStep);
    setVoiceFeedback(
      requestedStep === 'batch-follow-up'
        ? 'Listening... say another batch fare, say finalize to save the queued fares into the current sheet, or say exit.'
        : editorMode === 'batch'
          ? 'Listening... say "10 na 16 pesos", "10 passengers 16 pesos", next box, standard, batch, or finalize session.'
          : 'Listening... say next box, previous box, next block, standard, batch, open calculator, or finalize session.'
    );
    setPendingVoiceNavAction(null);

    const recognition = new RecognitionCtor();
    voiceRecognitionRef.current = recognition;
    recognition.lang = 'en-PH';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsVoiceListening(true);
    recognition.onerror = event => {
      setVoiceFeedback(getSpeechRecognitionErrorMessage(event.error));
      setIsVoiceListening(false);
    };
    recognition.onresult = event => {
      const recognitionResult = event.results[event.results.length - 1];
      const alternative = recognitionResult?.[0];
      const transcript = alternative?.transcript?.trim() ?? '';
      const confidence = typeof alternative?.confidence === 'number' ? alternative.confidence : null;
      const batchCountResult = editorMode === 'batch' || requestedStep === 'batch-follow-up'
        ? parseBatchCountVoiceTranscript(transcript, allBatchFares)
        : null;
      const shiftCommand = parseShiftVoiceCommand(transcript);
      const parsed = parseTallyNavigationVoiceTranscript(transcript);

      setVoiceTranscript(transcript);
      setVoiceConfidence(confidence);

      if (shiftCommand.status === 'match') {
        setPendingVoiceNavAction(null);
        setTallyVoiceStep('command');
        if (shiftCommand.command === 'start-shift') {
          const startedShift = startShift('manual');
          const message = startedShift
            ? `Shift started at ${new Date(startedShift.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. You can keep working now.`
            : 'Shift is already open. You can keep working now.';
          setVoiceFeedback(message);
          speakVoiceReply(message);
        } else {
          const closedShift = endShift();
          const message = closedShift
            ? `Shift ended at ${new Date(closedShift.endedAt ?? Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
            : 'No open shift to end right now.';
          setVoiceFeedback(message);
          speakVoiceReply(message);
        }
        return;
      }

      if (batchCountResult?.status === 'match') {
        setPendingVoiceNavAction(null);
        applyBatchVoiceCount(batchCountResult.quantity, batchCountResult.fare);
        return;
      }

      if (requestedStep === 'batch-follow-up') {
        const followUp = parseTallyBatchFollowUpTranscript(transcript);

        if (followUp.status === 'match') {
          setPendingVoiceNavAction(null);

          if (followUp.command === 'next-batch') {
            queueTallyVoicePrompt(
              'Okay. Say the next batch fare now, like "10 na 16 pesos".',
              'command',
              true
            );
            return;
          }

          if (followUp.command === 'finalize-session') {
            const finalizeMessage =
              'Finalizing saves the queued batch fares into the current sheet. Review it, then confirm below.';
            setPendingVoiceNavAction({
              status: 'match',
              transcript,
              normalized: followUp.normalized,
              command: 'finalize-session',
              label: 'Finalize Session',
              requiresConfirmation: true
            });
            setTallyVoiceStep('command');
            setVoiceFeedback(finalizeMessage);
            speakVoiceReply(finalizeMessage);
            return;
          }

          setTallyVoiceStep('command');
          setVoiceFeedback('Voice batch assistant closed. Tap the mic any time when you are ready again.');
          speakVoiceReply('Voice batch assistant closed. Tap the mic any time when you are ready again.');
          return;
        }

        if (parsed.status === 'match') {
          if (parsed.command === 'next-block' && !hasNextBlock) {
            setPendingVoiceNavAction(null);
            setVoiceFeedback('There is no next block left on this sheet.');
            return;
          }

          if (parsed.requiresConfirmation) {
            setPendingVoiceNavAction(parsed);
            setVoiceFeedback(
              parsed.command === 'next-block'
                ? `Heard ${parsed.label}. Review it, then confirm below because this may save the current entries.`
                : `Heard ${parsed.label}. Review it, then confirm below before finalizing.`
            );
            setTallyVoiceStep('command');
            return;
          }

          setPendingVoiceNavAction(null);
          setTallyVoiceStep('command');
          applyImmediateVoiceNavigation(parsed);
          return;
        }

        setPendingVoiceNavAction(null);
        queueTallyVoicePrompt(followUp.message, 'batch-follow-up', true);
        return;
      }

      if (parsed.status !== 'match') {
        setPendingVoiceNavAction(null);
        setVoiceFeedback(
          batchCountResult?.status === 'invalid' ? batchCountResult.message : parsed.message
        );
        return;
      }

      if (parsed.command === 'next-block' && !hasNextBlock) {
        setPendingVoiceNavAction(null);
        setVoiceFeedback('There is no next block left on this sheet.');
        return;
      }

      if (parsed.requiresConfirmation) {
        setPendingVoiceNavAction(parsed);
        setVoiceFeedback(
          parsed.command === 'next-block'
            ? `Heard ${parsed.label}. Review it, then confirm below because this may save the current entries.`
            : `Heard ${parsed.label}. Review it, then confirm below before finalizing.`
        );
        return;
      }

      setPendingVoiceNavAction(null);
      setTallyVoiceStep('command');
      applyImmediateVoiceNavigation(parsed);
    };
    recognition.onend = () => {
      setIsVoiceListening(false);
      voiceRecognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setVoiceFeedback('Voice recognition could not start. Please try again.');
      setIsVoiceListening(false);
    }
  };

  const handleClearSavedSlot = (slotIdx: number) => {
    const previousValue = activeSheet.slots[slotIdx];
    setSessions(prev =>
      prev.map(session =>
        session.id === activeSession.id
          ? {
              ...session,
              trips: session.trips.map((trip, tripIdx) =>
                tripIdx === tallyNav.tripIdx
                  ? {
                      ...trip,
                      sheets: trip.sheets.map((sheet, sheetIdx) =>
                        sheetIdx === tallyNav.sheetIdx
                          ? {
                              ...sheet,
                              slots: sheet.slots.map((slot, index) => (index === slotIdx ? 0 : slot)),
                              lastUpdatedAt: Date.now()
                            }
                          : sheet
                      )
                    }
                  : trip
              )
            }
          : session
      )
    );
    showToast(`Box ${slotIdx + 1} cleared`);
    void trackAnalyticsEvent({
      eventType: 'tally_box_cleared',
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      routeId: activeRoute.id,
      routeLabel: activeRoute.label,
      appSurface: 'tally',
      metadata: {
        tripName: activeTrip.name,
        direction: activeTrip.direction,
        sheetNumber: tallyNav.sheetIdx + 1,
        blockNumber: Math.floor(slotIdx / SLOTS_PER_BLOCK) + 1,
        boxNumber: slotIdx + 1,
        clearedValue: previousValue
      }
    });
  };

  return (
    <div className="flex flex-col min-h-full bg-slate-50 dark:bg-black transition-all overflow-hidden">
      <header className="shrink-0 bg-primary flex items-center justify-between px-6 py-4 shadow-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="material-icons text-white text-2xl">fact_check</span>
          <div>
            <h1 className="text-xl font-medium text-white tracking-tight">Tally Sheet</h1>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/70">{activeRoute.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsTallyCalcOpen(true)}
            className="bg-white/10 hover:bg-white/20 text-white w-12 h-12 rounded-2xl transition-colors flex items-center justify-center border border-white/10"
            title="Open tally calculator"
          >
            <span className="material-icons text-2xl leading-none">calculate</span>
          </button>
          <button 
            onClick={onExit}
            className="bg-white/10 hover:bg-white/20 text-white w-12 h-12 rounded-2xl transition-colors flex items-center justify-center border border-white/10"
          >
            <span className="material-icons text-2xl leading-none">close</span>
          </button>
        </div>
      </header>

      {/* Waybill Main Tally Grid Headers */}
      <div className="sticky top-[72px] z-30 bg-white dark:bg-night-charcoal border-b dark:border-white/10 shadow-sm h-auto shrink-0">
        <div className="flex bg-slate-100 dark:bg-black/40 h-auto items-center">
          <div className="flex flex-1 overflow-x-auto scrollbar-hide">
            {activeSession.trips.map((t, i) => (
              <button
                key={t.id}
                onClick={() => {
                  setTallyNav(n => ({ ...n, tripIdx: i, sheetIdx: 0, blockIdx: 0 }));
                  setSelectedSlotIdx(getFirstEmptySlotIndex(t.sheets[0]?.slots ?? Array(SLOTS_PER_SHEET).fill(0)));
                }}
                className={`flex-shrink-0 px-8 py-4 border-b-2 transition-all ${tallyNav.tripIdx === i ? 'bg-white dark:bg-night-charcoal border-primary text-primary' : 'border-transparent text-slate-400'}`}>
                <span className="font-900 uppercase text-[11px] tracking-[0.1em]">{t.name}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setPendingAction({ type: 'trip' })} className="w-16 h-12 flex items-center justify-center text-primary active:scale-90 transition-transform">
             <span className="material-icons text-2xl">add_circle</span>
          </button>
        </div>
        <div className="flex bg-white dark:bg-night-charcoal h-auto items-center border-t border-slate-100 dark:border-white/5">
          <div className="flex flex-1 overflow-x-auto scrollbar-hide">
            {activeTrip.sheets.map((s, i) => (
              <button
                key={s.id}
                onClick={() => {
                  setTallyNav(n => ({ ...n, sheetIdx: i, blockIdx: 0 }));
                  setSelectedSlotIdx(getFirstEmptySlotIndex(s.slots));
                }}
                className={`flex-shrink-0 min-w-[90px] py-3.5 border-b-2 transition-all flex flex-col items-center justify-center ${tallyNav.sheetIdx === i ? 'border-primary text-primary bg-white dark:bg-white/5' : 'border-transparent text-slate-300'}`}>
                <span className="font-900 uppercase text-[10px] tracking-wider leading-none">Sheet {i + 1}</span>
              </button>
            ))}
          </div>
          {activeTrip.sheets.length > 1 && (
            <button
              onClick={() => setPendingAction({ type: 'delete-sheet', sheetIdx: tallyNav.sheetIdx })}
              className="w-16 h-12 flex items-center justify-center text-slate-300 active:text-red-500 transition-colors"
              title={`Delete Sheet ${tallyNav.sheetIdx + 1}`}
            >
              <span className="material-icons text-[22px]">delete</span>
            </button>
          )}
          <button onClick={() => setPendingAction({ type: 'sheet' })} className="w-16 h-12 flex items-center justify-center text-slate-300 active:text-primary transition-colors">
             <span className="material-icons text-2xl">add</span>
          </button>
        </div>
         <div className="px-4 py-2.5 bg-white dark:bg-night-charcoal flex items-center justify-between h-auto border-t border-slate-50 dark:border-white/5">
            <button onClick={() => setPendingAction({ type: 'flip-direction' })} className="flex items-center gap-3 active:scale-95 transition-transform bg-slate-50 dark:bg-white/5 px-4 py-1.5 rounded-xl border border-slate-100 dark:border-white/5">
               <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${activeTrip.direction === 'north' ? 'bg-primary text-white' : 'bg-slate-800 text-white'}`}>
                 <span className="material-icons text-xs">{activeTrip.direction === 'north' ? 'north' : 'south'}</span>
               </div>
               <div className="text-left">
                 <p className="text-[6px] font-black uppercase text-slate-400 leading-none mb-0.5">Heading</p>
                 <span className="font-black uppercase text-[10px] tracking-tight text-slate-900 dark:text-white leading-none">{activeTrip.direction === 'north' ? northboundTerminal : southboundTerminal}</span>
               </div>
            </button>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Trip Total</p>
                <p className="text-xl font-900 text-slate-900 dark:text-white leading-none">{peso}{tripTotal}</p>
              </div>
              <div className="text-right">
                <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Sheet Total</p>
                <p className="text-xl font-900 text-primary leading-none">{peso}{sheetTotal}</p>
              </div>
           </div>
         </div>
        <div className="flex gap-2 border-t border-slate-200 bg-slate-100 p-2 dark:border-white/10 dark:bg-[var(--app-dark-surface)]">
          {[0, 1, 2, 3].map(b => (
            <div key={b} className="flex-1 flex flex-col items-stretch">
               <button type="button" onClick={() => jumpToBlock(b)}
                 className={`w-full rounded-xl border py-2 font-black transition-all active:scale-[0.99] ${
                   tallyNav.blockIdx === b
                    ? 'border-primary/25 bg-white text-primary shadow-sm dark:border-primary/30 dark:bg-night-charcoal'
                    : 'border-slate-200 bg-white text-slate-500 shadow-sm dark:border-white/10 dark:bg-[var(--app-dark-soft)] dark:text-slate-200'
                 }`}>
                 <span className="block text-[8px] uppercase tracking-tighter opacity-70">Block {b + 1} ({blockCounts[b]}/{SLOTS_PER_BLOCK})</span>
                 <span className="mt-1 block text-[10px]">{peso}{blockTotals[b]}</span>
               </button>
                <button type="button" onClick={() => setPendingAction({ type: 'reset-block', blockIdx: b })} className="mt-1 flex items-center justify-center gap-1 text-slate-400 transition-colors hover:text-red-500 dark:text-slate-300">
                  <span className="material-icons text-xs">refresh</span>
                  <span className="text-[8px] font-bold uppercase tracking-wider">reset</span>
                </button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 grid grid-cols-5 gap-3.5 flex-1 overflow-y-auto pb-8">
        {activeSheet.slots.slice(tallyNav.blockIdx * SLOTS_PER_BLOCK, (tallyNav.blockIdx + 1) * SLOTS_PER_BLOCK).map((val, i) => {
          const idx = tallyNav.blockIdx * SLOTS_PER_BLOCK + i;
          return (
            <div
              key={idx}
              className={`relative aspect-square ${
                val > 0 ? 'text-white' : 'text-slate-500 dark:text-slate-100'
              }`}
            >
              <button
                type="button"
                onClick={() => handleSlotClick(idx)}
                className={`h-full w-full cursor-pointer touch-manipulation select-none rounded-[1.25rem] border transition-all ${
                  val > 0
                    ? 'border-primary bg-primary text-white shadow-md'
                    : 'border-slate-200 bg-white text-slate-500 shadow-sm hover:border-primary/40 hover:bg-slate-50 dark:border-white/10 dark:bg-[var(--app-dark-soft)] dark:text-slate-100 dark:hover:border-primary/40 dark:hover:bg-white/[0.08]'
                } flex flex-col items-center justify-center`}
              >
              <span className={`absolute left-2 top-2 text-[7px] font-black ${val > 0 ? 'opacity-40' : 'opacity-60 dark:text-slate-400'}`}>{idx + 1}</span>
              <span className="font-900 text-lg leading-none">{val || ''}</span>
              </button>
              {val > 0 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleClearSavedSlot(idx);
                  }}
                  className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white/85 text-slate-500 active:scale-90 dark:bg-black/50"
                  title={`Clear box ${idx + 1}`}
                >
                  <span className="material-icons text-[11px] leading-none">close</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isEditorOpen && (
        <div className="fixed inset-0 z-[100] flex h-[100svh] flex-col overflow-hidden">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setIsEditorOpen(false)} />
          
          <div className="relative mt-2 flex h-[calc(100svh-0.5rem)] max-h-[calc(100svh-0.5rem)] min-h-0 flex-col overflow-hidden rounded-t-[3.5rem] bg-white shadow-2xl animate-in slide-in-from-bottom duration-300 dark:bg-night-charcoal">
            <input 
              ref={inputRef} 
              type="number" 
              inputMode="numeric" 
              className="absolute top-0 opacity-0 pointer-events-none" 
              value={editValue} 
              onChange={e => {
                if (editorMode === 'batch') {
                  setPendingAction({ type: 'batch-typing-help' });
                  return;
                }

                setEditValue(e.target.value);
              }} 
              onKeyDown={e => {
                if (editorMode === 'batch') {
                  e.preventDefault();
                  setPendingAction({ type: 'batch-typing-help' });
                  return;
                }

                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitStandardEntry(parseInt(editValue) || 0);
                }
              }} 
            />

            {/* MODAL HEADER */}
            <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-2">
              <div>
                <h1 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Waybill Entry</h1>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-zinc-900 px-4 py-2 text-right shadow-sm dark:bg-black">
                  <p className="text-[7px] font-black uppercase tracking-widest text-slate-500">Gross</p>
                  <p className="mt-1 text-lg font-900 leading-none text-white">{peso}{grandTotalInEditor}</p>
                </div>
                <button
                  onClick={() => setIsEditorOpen(false)}
                  className="flex h-11 w-11 min-w-[44px] items-center justify-center rounded-full bg-slate-100 shadow-sm dark:bg-white/10"
                >
                  <span className="material-icons text-slate-600 dark:text-white text-lg">close</span>
                </button>
              </div>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-4 pt-1 touch-pan-y visible-scrollbar"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="space-y-3">
              {isCurrentEntryCollapsed ? (
                <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm dark:border-white/5 dark:bg-black/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-400">Current Entry</p>
                      <p className="mt-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-800 dark:text-white">
                        {collapsedCurrentEntryTitle}
                      </p>
                      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                        {collapsedRemainingSlotsSummary}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCurrentEntryCollapsed(false)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm active:scale-95 dark:bg-black/30 dark:text-slate-300"
                      title="Expand current entry"
                    >
                      <span className="material-icons text-base">expand_more</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[2rem] border border-slate-100 bg-slate-50 px-4 py-4 shadow-sm dark:border-white/5 dark:bg-black/30">
                  <div className="flex items-start justify-between gap-3">
                    <HelpHint
                      label="This card shows the slot you are filling now, the next slot after it, and which trip and sheet you are currently working on."
                      triggerClassName="inline-flex cursor-pointer rounded-md text-[8px] font-black uppercase tracking-[0.25em] text-slate-400"
                    >
                      Current Entry
                    </HelpHint>
                    <button
                      type="button"
                      onClick={() => setIsCurrentEntryCollapsed(true)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm active:scale-95 dark:bg-black/30 dark:text-slate-300"
                      title="Collapse current entry"
                    >
                      <span className="material-icons text-base">expand_less</span>
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-y-3 min-[390px]:grid-cols-2 min-[390px]:gap-x-4">
                    <div className="min-w-0">
                      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-primary/70">Now Filling</p>
                      <p className="mt-2 text-lg font-900 leading-none text-slate-900 max-[360px]:text-base dark:text-white sm:text-xl">{compactCurrentBoxLabel}</p>
                      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 max-[360px]:text-[9px]">
                        Trip {tallyNav.tripIdx + 1} • Sheet {tallyNav.sheetIdx + 1}
                      </p>
                    </div>
                    <div className="min-w-0 text-left min-[390px]:text-right">
                      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-400">Then Next</p>
                      <p className="mt-2 text-sm font-900 leading-none text-slate-800 max-[360px]:text-[13px] dark:text-white sm:text-base">{compactNextBoxLabel}</p>
                    </div>
                    <p className="text-center text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 max-[360px]:text-[8px] min-[390px]:col-span-2 sm:text-[10px]">
                      {remainingSlotsSummary}
                    </p>
                  </div>
                </div>
              )}

              <div
                className={`rounded-[2.25rem] border-2 px-4 py-4 transition-all ${
                  isFlashing
                    ? 'bg-neon-green/10 border-neon-green shadow-lg'
                    : 'bg-slate-50 dark:bg-black/40 border-slate-100 dark:border-white/5 shadow-inner'
                }`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 max-[360px]:gap-1">
                  <button
                    onClick={() => setEditorMode('standard')}
                    className={`min-w-0 rounded-full px-3 py-2 text-[9px] font-900 uppercase tracking-[0.16em] transition-colors max-[360px]:px-2 max-[360px]:text-[8px] ${
                      editorMode === 'standard'
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-white text-slate-500 shadow-sm dark:bg-black/30 dark:text-slate-300'
                    }`}
                  >
                    Standard
                  </button>
                  <HelpHint
                    label="Standard is for tapping one fare into the current slot. Batch is for counting several passengers with the same fare. The center box shows what will be saved next."
                    triggerClassName="inline-flex cursor-pointer justify-center rounded-md text-center text-[8px] font-black uppercase tracking-[0.18em] text-slate-400 max-[360px]:text-[7px]"
                  >
                    Punch Amount
                  </HelpHint>
                  <button
                    onClick={() => setEditorMode('batch')}
                    className={`min-w-0 rounded-full px-3 py-2 text-[9px] font-900 uppercase tracking-[0.16em] transition-colors max-[360px]:px-2 max-[360px]:text-[8px] ${
                      editorMode === 'batch'
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-white text-slate-500 shadow-sm dark:bg-black/30 dark:text-slate-300'
                    }`}
                  >
                    Batch
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 max-[360px]:grid-cols-[40px_minmax(0,1fr)_40px] sm:grid-cols-[48px_minmax(0,1fr)_48px] sm:gap-3">
                  <button
                    onClick={handlePreviousTarget}
                    disabled={!hasPreviousTargetSlot}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition-transform active:scale-95 disabled:opacity-40 dark:bg-night-charcoal dark:text-slate-300"
                    title="Previous box"
                  >
                    <span className="material-icons text-xl">chevron_left</span>
                  </button>
                  <button
                    onClick={handlePunchBoxPress}
                    className="mx-auto flex min-h-[118px] w-full max-w-[18.5rem] flex-col rounded-[1.75rem] bg-white/80 px-3 py-4 text-left shadow-sm active:scale-[0.99] max-[360px]:min-h-[110px] dark:bg-black/30 sm:min-h-[132px] sm:px-4"
                  >
                    <div className="mt-2 flex items-end justify-center gap-2 text-center">
                      <span className="text-2xl font-900 leading-none text-slate-400">{peso}</span>
                      <h3 className={`text-4xl font-900 leading-none tracking-tight transition-colors max-[360px]:text-[2.5rem] sm:text-5xl ${
                        isFlashing ? 'text-neon-green' : ((currentTypingValue > 0 || stagedStandardEntries.length > 0 || batchTotalGross > 0) ? 'text-primary' : 'text-slate-900 dark:text-white')
                      }`}>
                        {displayedPunchAmount}
                      </h3>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 max-[360px]:text-[8px] sm:gap-x-3 sm:text-[10px]">
                      <span>Block {peso}{projectedBlockTotals[auditBlockIdx]}</span>
                      <span className="text-slate-300">|</span>
                      <span>Sheet {peso}{projectedSheetTotal}</span>
                      <span className="text-slate-300">|</span>
                      <span>{previewEntryCount} pending</span>
                    </div>

                    <p className="mt-3 text-center text-[8px] font-black uppercase tracking-[0.14em] text-slate-400 sm:text-[9px]">
                      Tap fares below or type directly
                    </p>
                  </button>
                  <button
                    onClick={() => setEditorTargetSlot(selectedSlotIdx + 1)}
                    disabled={!hasNextTargetSlot}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-transform active:scale-95 disabled:bg-slate-300 dark:disabled:bg-white/10"
                    title="Next box"
                  >
                    <span className="material-icons text-xl">chevron_right</span>
                  </button>
                </div>

                <div className="mt-3 flex flex-col items-center justify-center gap-2 text-center sm:flex-row sm:justify-between sm:gap-3">
                  <HelpHint
                    label="When you press Enter on the keyboard or use the save flow, the current punch amount is staged into the active slot. Next Block saves first, then jumps to the next block."
                    triggerClassName="inline-flex cursor-pointer rounded-md text-center text-[9px] font-black uppercase tracking-[0.14em] text-slate-400 max-[360px]:text-[8px]"
                  >
                    Enter saves current amount
                  </HelpHint>
                  <button
                    onClick={() => finalizeDraftAndJumpToBlock(tallyNav.blockIdx + 1)}
                    disabled={!hasNextBlock}
                    className="w-full max-w-[13rem] rounded-full bg-primary px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-sm disabled:bg-slate-300 dark:disabled:bg-white/10 sm:w-auto sm:max-w-none"
                  >
                    Next Block
                  </button>
                </div>

              </div>

              {(voiceFeedback || voiceTranscript || pendingVoiceNavAction) && (
                <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-black/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary">
                        {tallyVoiceStep === 'batch-follow-up' ? 'Voice Batch Follow-Up' : 'Voice Assistant'}
                      </p>
                      <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">{voiceFeedback}</p>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {formatVoiceConfidence(voiceConfidence)}
                    </p>
                  </div>
                  {voiceTranscript && (
                    <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-300">
                      Heard: "{voiceTranscript}"
                    </p>
                  )}
                  {pendingVoiceNavAction && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={confirmVoiceNavigation}
                        className="rounded-full bg-primary px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                      >
                        Confirm {pendingVoiceNavAction.label}
                      </button>
                      <button
                        onClick={() => setPendingVoiceNavAction(null)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SCROLLABLE ENTRY BODY */}
              <div className="mb-3 rounded-[1.5rem] border border-slate-200 bg-white/85 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-black/30">
                <div className="flex items-center justify-between gap-3">
                  <HelpHint
                    label={
                      editorMode === 'batch'
                        ? 'Queued batch fares stay here until you finalize. Expand the list to remove any wrong count before saving.'
                        : 'Queued fare taps stay here until you finalize. Expand the list to remove a wrong fare before it is saved into the sheet.'
                    }
                    triggerClassName="inline-flex cursor-pointer rounded-md text-[9px] font-black uppercase tracking-[0.25em] text-slate-500"
                  >
                    Queued Entries
                  </HelpHint>
                  <button
                    type="button"
                    onClick={() => setIsEntryTapeExpanded(current => !current)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:bg-white/10 dark:text-slate-200"
                  >
                    {isEntryTapeExpanded ? 'Hide' : 'Show'}
                  </button>
                </div>

                <p className="mt-2 text-[11px] font-bold text-slate-500 dark:text-slate-300">
                  {editorMode === 'batch' ? batchTapeSummary : standardTapeSummary}
                </p>

                {isEntryTapeExpanded && (
                  <div className="mt-3">
                    {editorMode === 'batch' ? (
                      selectedBatchItems.length > 0 ? (
                        <div className="space-y-2">
                          {selectedBatchItems.map(([fare, count]) => (
                            <div
                              key={`${fare}-${count}`}
                              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20"
                            >
                              <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Queued Fare</p>
                                <p className="mt-1 text-base font-900 text-slate-900 dark:text-white">{count} x {peso}{fare}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setBatchCounts(prev => ({ ...prev, [fare]: '0' }))}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm active:scale-90 dark:bg-black/40"
                                title={`Remove ${fare}`}
                              >
                                <span className="material-icons text-sm leading-none">close</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm font-bold text-slate-500">No batch fares selected yet.</p>
                      )
                    ) : stagedStandardEntries.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {stagedStandardEntries.map((fare, i) => (
                          <div key={`${fare}-${i}`} className={`relative min-h-[56px] rounded-xl border px-3 py-2 shadow-sm ${getTapeHighlight(selectedSlotIdx + i + 1)}`}>
                            <span className="absolute left-2 top-2 text-[7px] font-black opacity-60">#{selectedSlotIdx + i + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveStagedEntry(i)}
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-slate-500 active:scale-90 dark:bg-black/60"
                              title={`Delete slot ${selectedSlotIdx + i + 1}`}
                            >
                              <span className="material-icons text-[11px] leading-none">close</span>
                            </button>
                            <div className="flex h-full items-center justify-center pt-2">
                              <span className="text-[11px] font-black">{peso}{fare}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : currentTypingValue > 0 ? (
                      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.06] px-4 py-3 text-center">
                        <p className="text-[8px] font-black uppercase tracking-widest text-primary/70">Current Draft</p>
                        <p className="mt-2 text-lg font-900 text-primary">{peso}{currentTypingValue}</p>
                        <button
                          type="button"
                          onClick={() => setEditValue('')}
                          className="mt-3 rounded-full bg-white px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 shadow-sm dark:bg-black/40 dark:text-slate-300"
                        >
                          Clear Draft
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-bold text-slate-500">No staged fares yet. Tap a fare square to start filling boxes.</p>
                    )}
                  </div>
                )}
              </div>
              {editorMode === 'standard' ? (
                <div className="pb-4">
                  <div className="relative z-10 grid grid-cols-3 gap-2.5">
                    {smartQuickFares.map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => commitStandardEntry(f, true)}
                        className="relative z-10 aspect-square touch-manipulation select-none rounded-[1.5rem] bg-primary text-2xl font-black text-white shadow-md transition-transform active:scale-90"
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                </div>
              ) : (
                <div className="pb-4">
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                        <input 
                          type="number" inputMode="numeric" 
                          placeholder="Search..." 
                          className="w-full pl-8 pr-7 py-2.5 bg-slate-50 dark:bg-white/5 border-2 border-slate-100 dark:border-white/5 rounded-xl font-black text-[11px] outline-none focus:border-primary"
                          value={batchSearch}
                          onChange={(e) => setBatchSearch(e.target.value)}
                        />
                        {batchSearch && <button type="button" onClick={() => setBatchSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><span className="material-icons text-xs">close</span></button>}
                      </div>
                      
                      {/* VIEW ONLY SELECTED TOGGLE */}
                      <button 
                        onClick={() => setShowOnlySelected(!showOnlySelected)}
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${showOnlySelected ? 'bg-primary border-primary text-white shadow-lg scale-105' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-400'}`}
                        title="Show selected only"
                      >
                        <span className="material-icons text-lg">{showOnlySelected ? 'visibility' : 'visibility_off'}</span>
                      </button>

                      {/* RESET ALL COUNTS */}
                      <button 
                        onClick={handleResetBatch}
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-90 transition-all ${Object.keys(batchCounts).length > 0 ? 'bg-white dark:bg-white/10 border-primary/20 text-primary shadow-sm' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-400'}`}
                        title="Clear all counts"
                      >
                        <span className="material-icons text-lg">refresh</span>
                      </button>
                    </div>

                    <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                      {batchFilterPresets.map(({ label, value }) => {
                        return (
                          <button type="button" key={label} onClick={() => setBatchSearch(value)} className={`px-3 py-1.5 rounded-full font-black text-[7px] uppercase tracking-widest border whitespace-nowrap ${batchSearch === value ? 'bg-primary border-primary text-white' : 'bg-white dark:bg-night-charcoal border-slate-200 dark:border-white/5 text-slate-400'}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="divide-y dark:divide-white/5" ref={scrollContainerRef}>
                    {filteredBatchFares.length > 0 ? (
                      filteredBatchFares.map(f => (
                        <div key={f} className={`flex items-center justify-between py-2.5 transition-colors ${batchCounts[f] ? 'bg-primary/5 px-1 rounded-xl' : ''}`}>
                          <div className="flex items-center gap-2">
                            <p className={`font-900 ${batchCounts[f] ? 'text-primary text-lg' : 'text-sm text-slate-800 dark:text-white'}`}>{peso}{f}</p>
                            {batchCounts[f] && <span className="w-1 h-1 rounded-full bg-neon-green shadow-sm animate-pulse"></span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setBatchCounts(p => ({...p, [f]: Math.max(0, parseInt(p[f] || '0') - 1).toString()}))} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center active:scale-90 transition-transform"><span className="material-icons text-xs">remove</span></button>
                            <input type="number" inputMode="numeric" className="w-12 h-8 bg-white dark:bg-black border rounded-lg text-center font-900 text-sm" value={batchCounts[f] || ''} placeholder="0" onChange={e => setBatchCounts(p => ({...p, [f]: e.target.value}))} />
                            <button type="button" onClick={() => setBatchCounts(p => ({...p, [f]: (parseInt(p[f] || '0') + 1).toString()}))} className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center active:scale-90 transition-transform"><span className="material-icons text-xs">add</span></button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-10 text-center opacity-30 text-[10px] font-black uppercase">
                        <span className="material-icons block text-3xl mb-2">search_off</span>
                        {showOnlySelected ? 'No selected fares to show' : 'No fares found'}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
            </div>

            {/* COLLAPSIBLE FOOTER */}
            <div className={`shrink-0 bg-white dark:bg-night-charcoal border-t dark:border-white/10 transition-all duration-300 overflow-hidden ${isFooterCollapsed ? 'max-h-[70px]' : 'max-h-[300px]'}`}>
               {/* MINIMIZED BAR */}
               {isFooterCollapsed ? (
                 <div 
                   onClick={() => setIsFooterCollapsed(false)}
                   className="flex items-center justify-between px-8 py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                 >
                   <div className="flex items-center gap-2">
                     <span className="material-icons text-emerald-500 text-sm">check_circle</span>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Finalize Session</p>
                   </div>
                   <div className="flex items-center gap-4">
                     <p className="text-xl font-900 text-primary">{peso}{grandTotalInEditor}</p>
                     <span className="material-icons text-slate-400">expand_less</span>
                   </div>
                 </div>
               ) : (
                 <div className="px-8 pt-4 pb-10">
                   <div className="flex items-center justify-between mb-4">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Final Review</p>
                     <button onClick={() => setIsFooterCollapsed(true)} className="p-1"><span className="material-icons text-slate-400">expand_more</span></button>
                   </div>
                   <div className="grid grid-cols-3 gap-2 mb-4">
                     <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 px-3 py-3">
                       <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">Added Money Now</p>
                       <p className="text-sm font-900 text-primary mt-2">{peso}{grandTotalInEditor}</p>
                     </div>
                     <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 px-3 py-3">
                       <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">Block After Finalizing</p>
                       <p className="text-sm font-900 text-slate-800 dark:text-white mt-2">{peso}{projectedBlockTotals[auditBlockIdx]}</p>
                     </div>
                     <div className="rounded-2xl border border-primary/10 bg-primary/[0.06] px-3 py-3">
                       <p className="text-[7px] font-black uppercase tracking-widest text-primary/70">Sheet After Finalizing</p>
                       <p className="text-sm font-900 text-primary mt-2">{peso}{projectedSheetTotal}</p>
                     </div>
                   </div>
                    <button 
                      onClick={() => setPendingAction({ type: 'finalize-session' })} 
                      disabled={grandTotalInEditor === 0} 
                      className="w-full bg-primary text-white py-4 rounded-[1.5rem] font-black uppercase text-[10px] shadow-lg active:scale-95 border-b-[4px] border-black/20 flex items-center justify-center gap-2"
                    >
                     Finalize Session {peso}{grandTotalInEditor}
                     <span className="material-icons text-sm">check_circle</span>
                   </button>
                 </div>
               )}
            </div>

            {/* OVERLAY ALERTS */}
            {blockAlert && (
              <div className="absolute inset-0 z-[110] flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm">
                <div className="bg-white dark:bg-night-charcoal rounded-[2.5rem] p-8 w-full shadow-2xl text-center border-t-8 border-primary">
                   <h3 className="text-lg font-900 text-slate-800 dark:text-white mb-2 uppercase tracking-tighter">BLOCK {blockAlert.completedBlock} COMPLETE</h3>
                   <div className="space-y-2 mt-6">
                      <button onClick={() => finalizeDraftAndJumpToBlock(blockAlert.nextBlock - 1)} className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase text-[10px]">Continue to Block {blockAlert.nextBlock}</button>
                      <button onClick={() => setBlockAlert(null)} className="w-full py-3 text-slate-400 font-black uppercase text-[9px]">Review Current Block</button>
                   </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {isEditorOpen && (
        <FloatingVoiceButton
          active={isVoiceListening}
          disabled={!canUseVoiceRecognition}
          label="Voice tally assistant"
          title={canUseVoiceRecognition ? 'Voice tally assistant' : 'Voice not available in this browser'}
          onActivate={() => startTallyNavigationVoice(tallyVoiceStep)}
        />
      )}

      {pendingAction && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-8">
           <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setPendingAction(null)} />
            <div className="relative bg-white dark:bg-night-charcoal rounded-[2.5rem] p-8 w-full shadow-2xl text-center">
              <h3 className="text-lg font-900 text-slate-800 dark:text-white mb-6 uppercase">
                {pendingAction.type === 'batch-typing-help' ? 'Typing Works In Standard' :
                 pendingAction.type === 'finalize-session' ? 'Finalize This Entry?' :
                 pendingAction.type === 'reset-batch' ? 'Clear Batch Entries?' :
                 pendingAction.type === 'delete-sheet' ? `Delete Sheet ${(pendingAction.sheetIdx ?? 0) + 1}?` :
                 pendingAction.type === 'reset-block' ? `Reset Block ${pendingAction.blockIdx! + 1}?` :
                 'Confirm Action'}
              </h3>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 -mt-4">
                {pendingAction.type === 'batch-typing-help' ? 'Batch uses the plus and minus counters. If you want to type a fare in the punch box, switch to Standard first.' :
                 pendingAction.type === 'finalize-session' ? `This will save ${previewEntryCount} pending entr${previewEntryCount === 1 ? 'y' : 'ies'} worth ${peso}${grandTotalInEditor} into the current sheet.` :
                 pendingAction.type === 'reset-batch' ? 'This will reset all current ticket counts to zero.' :
                 pendingAction.type === 'delete-sheet' ? 'This removes the current sheet and keeps the remaining sheet numbers in order.' :
                 pendingAction.type === 'reset-block' ? 'All 25 slots in this block will be cleared. This action cannot be undone.' :
                 'Are you sure you want to proceed?'}
              </p>
              <div className="space-y-2">
                  <button onClick={() => {
                      if (pendingAction.type === 'batch-typing-help') {
                        setPendingAction(null);
                        setEditorMode('standard');
                        inputRef.current?.focus();
                      }
                      else if (pendingAction.type === 'finalize-session') {
                        setPendingAction(null);
                        handleConfirmAll();
                      }
                      else if (pendingAction.type === 'trip') handleAddTrip();
                      else if (pendingAction.type === 'sheet') handleAddSheet();
                      else if (pendingAction.type === 'delete-sheet') handleDeleteSheet(pendingAction.sheetIdx ?? tallyNav.sheetIdx);
                      else if (pendingAction.type === 'flip-direction') handleFlipDirection();
                      else if (pendingAction.type === 'reset-block') handleResetBlock(pendingAction.blockIdx!);
                      else if (pendingAction.type === 'reset-batch') confirmResetBatch();
                    }} className="w-full bg-primary text-white py-4 rounded-xl font-black uppercase tracking-widest text-[10px]">
                    {pendingAction.type === 'batch-typing-help'
                      ? 'Switch To Standard'
                      : pendingAction.type === 'finalize-session'
                        ? 'Save And Finalize'
                        : 'Confirm'}
                  </button>
                  <button onClick={() => setPendingAction(null)} className="w-full py-3 text-slate-400 font-black uppercase text-[9px]">Cancel</button>
              </div>
           </div>
        </div>
      )}

      <TallyCalcOverlay
        isOpen={isTallyCalcOpen}
        onClose={() => setIsTallyCalcOpen(false)}
        initialInput={parseInt(editValue, 10) || 0}
        onApplyTotal={isEditorOpen ? handleApplyCalcTotal : undefined}
        onApplyEntries={isEditorOpen ? handleApplyCalcEntries : undefined}
      />
    </div>
  );
};

export default TallyScreen;

