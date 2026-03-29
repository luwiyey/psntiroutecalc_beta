import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import StopPickerOverlay from './StopPickerOverlay';
import HelpHint from './HelpHint';
import FloatingVoiceButton from './FloatingVoiceButton';
import { formatEta } from '../utils/stop-data';
import type { BrowserSpeechRecognition, StopReminderVoiceParseResult } from '../utils/voice';
import {
  cancelVoiceReply,
  extractRecognitionTranscript,
  findTopStopVoiceSuggestions,
  formatVoiceConfidence,
  getSpeechRecognitionCtor,
  getSpeechRecognitionErrorMessage,
  parsePassengerCountVoiceTranscript,
  parseShiftVoiceCommand,
  parseStopReminderVoiceChainDetailed,
  parseStopReminderFollowUpTranscript,
  parseStopReminderVoiceTranscript,
  parseStopVoiceTranscript,
  parseVoiceBinaryAnswer,
  speakVoiceReply
} from '../utils/voice';
import {
  findNearestMappedSegment,
  findNearestMappedStop,
  type CurrentLocationSnapshot
} from '../utils/location';
import {
  hasGoogleMapsAssistConfig,
  searchGooglePlaceCandidates,
  type GooglePlaceCandidate
} from '../utils/google-maps-assist';

interface Props {
  onExit?: () => void;
}

type ReminderVoiceStep = 'stop-and-count' | 'count-only' | 'confirm' | 'next-or-exit';

type ReminderMatchConfidence = 'exact-stop' | 'near-stop' | 'manual-pick';

type VoiceQueuedReminderAction = {
  reminderId: string;
  stopName: string;
  addedCount: number;
  previousCount: number;
};

type PendingVoiceReminder = {
  stopName: string;
  passengerCount: number;
  matchedLabel: string;
  matchConfidence: Exclude<ReminderMatchConfidence, 'manual-pick'>;
};

type PendingStopPickerQueue = {
  passengerCount: number;
  matchedPlaceLabel: string | null;
};

type ReminderQueueRequest = {
  stopName: string;
  passengerCount: number;
  matchConfidence?: ReminderMatchConfidence;
  matchedPlaceLabel?: string | null;
};

type VoiceStopResolution =
  | {
      status: 'exact-stop';
      stopName: string;
      matchedLabel: string;
      matchConfidence: Exclude<ReminderMatchConfidence, 'manual-pick'>;
    }
  | {
      status: 'manual-pick-needed';
      message: string;
      initialSearch: string;
      suggestedStops: string[];
    };

const AlertsScreen: React.FC<Props> = ({ onExit }) => {
  const {
    activeRoute,
    settings,
    stopReminders,
    setStopReminders,
    reminderSettings,
    setReminderSettings,
    startShift,
    endShift,
    showToast
  } = useApp();
  const [isStopPickerOpen, setIsStopPickerOpen] = useState(false);
  const [stopPickerInitialSearch, setStopPickerInitialSearch] = useState('');
  const [stopPickerSuggestedStops, setStopPickerSuggestedStops] = useState<string[]>([]);
  const [stopPickerHelperMessage, setStopPickerHelperMessage] = useState<string | null>(null);
  const [pendingStopPickerQueue, setPendingStopPickerQueue] = useState<PendingStopPickerQueue | null>(null);
  const [draftStopName, setDraftStopName] = useState('');
  const [passengerCount, setPassengerCount] = useState('1');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [voiceStep, setVoiceStep] = useState<ReminderVoiceStep>('stop-and-count');
  const [pendingVoiceStopName, setPendingVoiceStopName] = useState<string | null>(null);
  const [pendingVoiceReminder, setPendingVoiceReminder] = useState<PendingVoiceReminder | null>(null);
  const [lastVoiceQueuedAction, setLastVoiceQueuedAction] = useState<VoiceQueuedReminderAction | null>(null);
  const [voicePlaceStatus, setVoicePlaceStatus] = useState<string | null>(null);
  const [voiceSuggestions, setVoiceSuggestions] = useState<string[]>([]);
  const [voiceSuggestionCount, setVoiceSuggestionCount] = useState<number | null>(null);
  const [voiceShortCommandMode, setVoiceShortCommandMode] = useState(false);
  const [pendingBulkVoiceAction, setPendingBulkVoiceAction] = useState<'clear-all' | null>(null);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const queuedVoiceTimeoutRef = useRef<number | null>(null);
  const pendingVoiceStopNameRef = useRef<string | null>(null);
  const pendingVoiceReminderRef = useRef<PendingVoiceReminder | null>(null);
  const latestVoiceTranscriptRef = useRef('');
  const voiceTranscriptHandledRef = useRef(false);
  const silentRetryCountRef = useRef(0);
  const canUseVoiceRecognition = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  const routeReminders = useMemo(
    () => stopReminders.filter(reminder => reminder.routeId === activeRoute.id),
    [activeRoute.id, stopReminders]
  );
  const routeStopIndexMap = useMemo(
    () => new Map(activeRoute.stops.map((stop, index) => [stop.name, index])),
    [activeRoute.stops]
  );
  const lastActiveReminderStopName =
    [...routeReminders]
      .filter(reminder => reminder.status !== 'done')
      .sort((left, right) => right.createdAt - left.createdAt)[0]?.stopName ?? null;

  const orderStopNamesByRouteContext = (stopNames: string[]) => {
    const uniqueStopNames = [...new Set(stopNames)];
    const anchorName = lastVoiceQueuedAction?.stopName ?? lastActiveReminderStopName;
    const anchorIndex =
      anchorName && routeStopIndexMap.has(anchorName)
        ? routeStopIndexMap.get(anchorName) ?? null
        : null;

    return uniqueStopNames.sort((left, right) => {
      const leftIndex = routeStopIndexMap.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = routeStopIndexMap.get(right) ?? Number.MAX_SAFE_INTEGER;

      if (anchorIndex === null) {
        return leftIndex - rightIndex;
      }

      const leftDistance = Math.abs(leftIndex - anchorIndex);
      const rightDistance = Math.abs(rightIndex - anchorIndex);
      return leftDistance - rightDistance || leftIndex - rightIndex;
    });
  };

  const setSuggestedVoiceStops = (stopNames: string[], nextPassengerCount: number | null = null) => {
    setVoiceSuggestions(orderStopNamesByRouteContext(stopNames).slice(0, 3));
    setVoiceSuggestionCount(nextPassengerCount);
  };
  const clearVoiceSuggestions = () => {
    setVoiceSuggestions([]);
    setVoiceSuggestionCount(null);
  };

  useEffect(() => {
    pendingVoiceStopNameRef.current = pendingVoiceStopName;
  }, [pendingVoiceStopName]);

  useEffect(() => {
    pendingVoiceReminderRef.current = pendingVoiceReminder;
  }, [pendingVoiceReminder]);

  useEffect(() => {
    setStopPickerInitialSearch('');
    setStopPickerSuggestedStops([]);
    setStopPickerHelperMessage(null);
    setPendingStopPickerQueue(null);
    setDraftStopName('');
    setPassengerCount('1');
    setIsVoiceListening(false);
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceFeedback(null);
    setVoiceStep('stop-and-count');
    setPendingVoiceStopName(null);
    setPendingVoiceReminder(null);
    setLastVoiceQueuedAction(null);
    setVoicePlaceStatus(null);
    setVoiceSuggestions([]);
    setVoiceSuggestionCount(null);
    setVoiceShortCommandMode(false);
    setPendingBulkVoiceAction(null);
    silentRetryCountRef.current = 0;
    latestVoiceTranscriptRef.current = '';
    voiceTranscriptHandledRef.current = false;
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
    cancelVoiceReply();
    if (queuedVoiceTimeoutRef.current) {
      window.clearTimeout(queuedVoiceTimeoutRef.current);
      queuedVoiceTimeoutRef.current = null;
    }
  }, [activeRoute.id]);

  useEffect(() => {
    return () => {
      voiceRecognitionRef.current?.abort();
      voiceRecognitionRef.current = null;
      cancelVoiceReply();
      if (queuedVoiceTimeoutRef.current) {
        window.clearTimeout(queuedVoiceTimeoutRef.current);
        queuedVoiceTimeoutRef.current = null;
      }
    };
  }, []);

  const toggleReminderSetting = (key: keyof typeof reminderSettings) => {
    setReminderSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const queueReminderEntries = (entries: ReminderQueueRequest[]) => {
    if (entries.length === 0) {
      return;
    }

    startShift('auto', { silent: true });
    let nextReminders = [...stopReminders];
    let lastQueuedAction: VoiceQueuedReminderAction | null = null;

    entries.forEach((entry, index) => {
      const existingReminderIndex = nextReminders.findIndex(
        reminder =>
          reminder.routeId === activeRoute.id &&
          reminder.stopName === entry.stopName &&
          reminder.status !== 'done'
      );

      if (existingReminderIndex >= 0) {
        const existingReminder = nextReminders[existingReminderIndex];
        nextReminders[existingReminderIndex] = {
          ...existingReminder,
          passengerCount: existingReminder.passengerCount + entry.passengerCount,
          enabled: true,
          status: 'active',
          matchConfidence: entry.matchConfidence ?? existingReminder.matchConfidence ?? 'exact-stop',
          matchedPlaceLabel: entry.matchedPlaceLabel ?? existingReminder.matchedPlaceLabel ?? null
        };
        lastQueuedAction = {
          reminderId: existingReminder.id,
          stopName: entry.stopName,
          addedCount: entry.passengerCount,
          previousCount: existingReminder.passengerCount
        };
        return;
      }

      const reminderId = `reminder-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      nextReminders = [
        {
          id: reminderId,
          routeId: activeRoute.id,
          routeLabel: activeRoute.label,
          stopName: entry.stopName,
          passengerCount: entry.passengerCount,
          enabled: true,
          status: 'active',
          createdAt: Date.now(),
          matchConfidence: entry.matchConfidence ?? 'exact-stop',
          matchedPlaceLabel: entry.matchedPlaceLabel ?? null,
          alertsTriggered: {
            twoMinute: false,
            oneMinute: false,
            arrival: false
          }
        },
        ...nextReminders
      ];
      lastQueuedAction = {
        reminderId,
        stopName: entry.stopName,
        addedCount: entry.passengerCount,
        previousCount: 0
      };
    });

    setStopReminders(nextReminders);
    const lastEntry = entries[entries.length - 1];
    setDraftStopName(lastEntry.stopName);
    setPassengerCount('1');
    setLastVoiceQueuedAction(lastQueuedAction);
  };

  const queueReminderForStop = (
    stopName: string,
    nextPassengerCount: number,
    options?: {
      matchConfidence?: ReminderMatchConfidence;
      matchedPlaceLabel?: string | null;
    }
  ) => {
    queueReminderEntries([
      {
        stopName,
        passengerCount: nextPassengerCount,
        matchConfidence: options?.matchConfidence,
        matchedPlaceLabel: options?.matchedPlaceLabel
      }
    ]);
  };

  const handleAddReminder = () => {
    if (!draftStopName) {
      showToast('Pick a stop first before queueing passengers.', 'info');
      return;
    }

    const nextPassengerCount = Math.max(1, parseInt(passengerCount, 10) || 1);
    queueReminderForStop(draftStopName, nextPassengerCount, {
      matchConfidence: 'exact-stop',
      matchedPlaceLabel: draftStopName
    });
    showToast('Drop-off reminder saved');
  };

  const undoLastVoiceQueuedReminder = () => {
    if (!lastVoiceQueuedAction) {
      return false;
    }

    setStopReminders(prev =>
      prev.flatMap(reminder => {
        if (reminder.id !== lastVoiceQueuedAction.reminderId) {
          return [reminder];
        }

        if (lastVoiceQueuedAction.previousCount <= 0) {
          return [];
        }

        return [
          {
            ...reminder,
            passengerCount: lastVoiceQueuedAction.previousCount,
            enabled: true,
            status: 'active'
          }
        ];
      })
    );
    setLastVoiceQueuedAction(null);
    return true;
  };

  const toggleReminder = (reminderId: string) => {
    setStopReminders(prev =>
      prev.map(reminder =>
        reminder.id === reminderId
          ? { ...reminder, enabled: !reminder.enabled }
          : reminder
      )
    );
  };

  const markReminderDone = (reminderId: string) => {
    setStopReminders(prev =>
      prev.map(reminder =>
        reminder.id === reminderId
          ? { ...reminder, status: 'done', enabled: false }
          : reminder
      )
    );
  };

  const removeReminder = (reminderId: string) => {
    setStopReminders(prev => prev.filter(reminder => reminder.id !== reminderId));
  };

  const clearAllRouteReminders = () => {
    setStopReminders(prev => prev.filter(reminder => reminder.routeId !== activeRoute.id));
  };

  const setAllRouteRemindersEnabled = (enabled: boolean) => {
    setStopReminders(prev =>
      prev.map(reminder =>
        reminder.routeId === activeRoute.id
          ? { ...reminder, enabled }
          : reminder
      )
    );
  };

  const findReminderByStopQuery = (stopQuery: string) => {
    if (!stopQuery.trim()) {
      const nextActiveReminder =
        [...routeReminders]
          .filter(reminder => reminder.status !== 'done')
          .sort((left, right) => left.createdAt - right.createdAt)[0] ?? null;

      return {
        reminder: nextActiveReminder,
        suggestions: nextActiveReminder ? [nextActiveReminder.stopName] : []
      };
    }

    const reminderStops = activeRoute.stops.filter(stop =>
      routeReminders.some(reminder => reminder.stopName === stop.name)
    );

    if (reminderStops.length === 0) {
      return {
        reminder: null as typeof routeReminders[number] | null,
        suggestions: [] as string[]
      };
    }

    const reminderRoute = { ...activeRoute, stops: reminderStops };
    const parsedStop = parseStopVoiceTranscript(stopQuery, reminderRoute);
    if (parsedStop.status === 'match') {
      return {
        reminder: routeReminders.find(reminder => reminder.stopName === parsedStop.stop.name) ?? null,
        suggestions: (parsedStop.suggestions ?? [parsedStop.stop]).map(stop => stop.name)
      };
    }

    return {
      reminder: null,
      suggestions: (parsedStop.suggestions ?? []).map(stop => stop.name)
    };
  };

  const clearQueuedVoicePrompt = () => {
    if (queuedVoiceTimeoutRef.current) {
      window.clearTimeout(queuedVoiceTimeoutRef.current);
      queuedVoiceTimeoutRef.current = null;
    }
  };

  const clearVoiceState = (options?: { keepFeedback?: boolean }) => {
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
    cancelVoiceReply();
    clearQueuedVoicePrompt();
    latestVoiceTranscriptRef.current = '';
    voiceTranscriptHandledRef.current = false;
    silentRetryCountRef.current = 0;
    setIsVoiceListening(false);
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setPendingVoiceReminder(null);
    setVoiceSuggestions([]);
    setVoiceSuggestionCount(null);
    setPendingBulkVoiceAction(null);
    if (!options?.keepFeedback) {
      setVoiceFeedback(null);
      setVoicePlaceStatus(null);
    }
    setVoiceStep('stop-and-count');
    setPendingVoiceStopName(null);
    pendingVoiceStopNameRef.current = null;
    pendingVoiceReminderRef.current = null;
  };

  const closeVoiceAssistant = (message?: string) => {
    clearQueuedVoicePrompt();
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
    cancelVoiceReply();
    setIsVoiceListening(false);
    setVoiceStep('stop-and-count');
    setPendingVoiceStopName(null);
    setPendingVoiceReminder(null);
    pendingVoiceStopNameRef.current = null;
    pendingVoiceReminderRef.current = null;
    silentRetryCountRef.current = 0;
    latestVoiceTranscriptRef.current = '';
    voiceTranscriptHandledRef.current = false;
    setVoiceSuggestions([]);
    setVoiceSuggestionCount(null);
    setPendingBulkVoiceAction(null);

    if (!message) {
      setVoiceFeedback(null);
      setVoiceTranscript('');
      setVoiceConfidence(null);
      setVoicePlaceStatus(null);
      return;
    }

    setVoiceFeedback(message);
    setVoicePlaceStatus(null);
    const hide = () => {
      setVoiceFeedback(null);
      setVoiceTranscript('');
      setVoiceConfidence(null);
    };

    const spoke = speakVoiceReply(message, {
      rate: 1.34,
      onEnd: hide,
      onError: hide
    });

    if (!spoke) {
      window.setTimeout(hide, 900);
    }
  };

  const queueVoicePrompt = (message: string, nextStep: ReminderVoiceStep) => {
    clearQueuedVoicePrompt();
    cancelVoiceReply();
    setVoiceFeedback(message);
    setVoiceStep(nextStep);

    const startListening = () => {
      void startReminderVoiceRecognition(nextStep);
    };

    const spoke = speakVoiceReply(message, {
      rate: 1.34,
      onEnd: () => {
        queuedVoiceTimeoutRef.current = window.setTimeout(startListening, 120);
      },
      onError: () => {
        queuedVoiceTimeoutRef.current = window.setTimeout(startListening, 120);
      }
    });

    if (!spoke) {
      queuedVoiceTimeoutRef.current = window.setTimeout(startListening, 120);
    }
  };

  const getListeningPrompt = (step: ReminderVoiceStep) => {
    switch (step) {
      case 'count-only':
        return pendingVoiceStopName
          ? `Listening... say how many passengers for ${pendingVoiceStopName}.`
          : 'Listening... say the passenger count.';
      case 'confirm':
        return 'Listening... say yes, wrong, replace it, or stay quiet to confirm.';
      case 'next-or-exit':
        return 'Listening... say the next stop and passenger count, say wrong, say undo, or say exit.';
      case 'stop-and-count':
      default:
        return voiceShortCommandMode
          ? 'Short command mode. Say only stop and passenger count, like "Anonas 2".'
          : 'Listening... say a stop and passenger count like "Anonas 2".';
    }
  };

  const getNoSpeechPrompt = (step: ReminderVoiceStep) => {
    switch (step) {
      case 'count-only':
        return pendingVoiceStopName
          ? `I am still here. Please say how many passengers for ${pendingVoiceStopName}, or say exit.`
          : 'I am still here. Please say the passenger count, or say exit.';
      case 'confirm':
        return 'I am still here. Say yes, wrong, or the corrected stop. If you stay quiet, I will add it.';
      case 'next-or-exit':
        return 'I am still here. Say the next stop and passenger count, say wrong, say undo, or say exit.';
      case 'stop-and-count':
      default:
        return voiceShortCommandMode
          ? 'I am still here. Short command mode is on. Say only stop and passenger count, like "Anonas 2".'
          : 'I am still here. Please say a stop and passenger count like "Anonas 2".';
    }
  };

  const openVoiceStopPickerFallback = (
    message: string,
    options: {
      initialSearch: string;
      suggestedStops?: string[];
      helperMessage?: string | null;
      passengerCountValue?: number | null;
    }
  ) => {
    if (typeof options.passengerCountValue === 'number' && options.passengerCountValue > 0) {
      setPassengerCount(String(options.passengerCountValue));
      setPendingStopPickerQueue({
        passengerCount: options.passengerCountValue,
        matchedPlaceLabel: options.initialSearch
      });
    } else {
      setPendingStopPickerQueue(null);
    }
    setStopPickerInitialSearch(options.initialSearch);
    setStopPickerSuggestedStops(orderStopNamesByRouteContext(options.suggestedStops ?? []));
    setStopPickerHelperMessage(options.helperMessage ?? message);
    clearVoiceState({ keepFeedback: false });
    setVoicePlaceStatus('Manual pick recommended');
    showToast('Pick the exact KM-post stop so the alert rings safely.', 'info');
    setIsStopPickerOpen(true);
  };

  const describeMatchConfidence = (matchConfidence: ReminderMatchConfidence) => {
    switch (matchConfidence) {
      case 'near-stop':
        return 'Near Stop';
      case 'manual-pick':
        return 'Manual Pick';
      case 'exact-stop':
      default:
        return 'Exact Stop';
    }
  };

  const confirmPendingVoiceReminder = () => {
    const reminderToConfirm = pendingVoiceReminderRef.current;
    if (!reminderToConfirm) {
      queueVoicePrompt('Please say the stop and passenger count again.', 'stop-and-count');
      return;
    }

    queueReminderForStop(reminderToConfirm.stopName, reminderToConfirm.passengerCount, {
      matchConfidence: reminderToConfirm.matchConfidence,
      matchedPlaceLabel: reminderToConfirm.matchedLabel
    });
    setDraftStopName(reminderToConfirm.stopName);
    setPassengerCount(String(reminderToConfirm.passengerCount));
    setPendingVoiceStopName(null);
    clearVoiceSuggestions();
    setPendingVoiceReminder(null);
    pendingVoiceStopNameRef.current = null;
    pendingVoiceReminderRef.current = null;
    setPendingBulkVoiceAction(null);
    setVoicePlaceStatus(
      `${describeMatchConfidence(reminderToConfirm.matchConfidence)} - ${reminderToConfirm.matchedLabel}`
    );
    showToast(
      `${reminderToConfirm.stopName} queued for ${reminderToConfirm.passengerCount} passenger${reminderToConfirm.passengerCount > 1 ? 's' : ''}`
    );
    queueVoicePrompt(
      `${reminderToConfirm.stopName} queued for ${reminderToConfirm.passengerCount} passenger${reminderToConfirm.passengerCount > 1 ? 's' : ''}. Say the next stop and passenger count, say undo, or say exit.`,
      'next-or-exit'
    );
  };

  const queueVoiceReminderConfirmation = (
    stopName: string,
    passengerCountValue: number,
    matchConfidence: Exclude<ReminderMatchConfidence, 'manual-pick'>,
    matchedLabel: string
  ) => {
    setPendingVoiceReminder({
      stopName,
      passengerCount: passengerCountValue,
      matchConfidence,
      matchedLabel
    });
    setPendingVoiceStopName(stopName);
    pendingVoiceStopNameRef.current = stopName;
    pendingVoiceReminderRef.current = {
      stopName,
      passengerCount: passengerCountValue,
      matchConfidence,
      matchedLabel
    };
    clearVoiceSuggestions();
    setPendingBulkVoiceAction(null);
    setDraftStopName(stopName);
    setVoicePlaceStatus(`${describeMatchConfidence(matchConfidence)} - ${matchedLabel}`);
    queueVoicePrompt(
      `I heard ${stopName}, ${passengerCountValue} passenger${passengerCountValue > 1 ? 's' : ''}. Say yes, say wrong, or stay quiet and I will add it.`,
      'confirm'
    );
  };

  const applyVoiceSuggestion = (stopName: string) => {
    const nextPassengerCount = voiceSuggestionCount;
    setDraftStopName(stopName);
    setPendingVoiceStopName(stopName);
    setVoicePlaceStatus(`Suggested exact route stop ${stopName}`);

    if (typeof nextPassengerCount === 'number' && nextPassengerCount > 0) {
      queueVoiceReminderConfirmation(stopName, nextPassengerCount, 'exact-stop', stopName);
      return;
    }

    queueVoicePrompt(`I heard ${stopName}. How many passengers are getting down there?`, 'count-only');
  };

  const extractReplacementTranscript = (transcript: string) => {
    const trimmed = transcript.trim();
    if (!trimmed) return '';

    const commaParts = trimmed.split(',');
    if (commaParts.length > 1) {
      return commaParts.slice(1).join(',').trim();
    }

    const patterns = [
      /\b(?:not|hindi|wrong|mali|sorry|replace(?: it)? with|it should be|should be|correct it to)\b\s+(.+)$/i
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    return '';
  };

  const createSyntheticPlaceLocation = (candidate: GooglePlaceCandidate): CurrentLocationSnapshot => ({
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    accuracy: 25,
    timestamp: Date.now(),
    source: 'browser'
  });

  const resolveVoiceStopToRoute = async (
    parsed: Extract<StopReminderVoiceParseResult, { status: 'match' }>
  ): Promise<VoiceStopResolution> => {
    if (parsed.stop) {
      return {
        status: 'exact-stop',
        stopName: parsed.stop.name,
        matchedLabel: parsed.stop.name,
        matchConfidence: parsed.stopMatchMode === 'fuzzy' ? 'near-stop' : 'exact-stop'
      };
    }

    if (!hasGoogleMapsAssistConfig()) {
      return {
        status: 'manual-pick-needed',
        message: 'I could not match that to an exact KM-post stop yet. Please use Pick Or Search Stop so the alert can ring on the right place.',
        initialSearch: parsed.stopQuery,
        suggestedStops: parsed.suggestions.map(stop => stop.name)
      };
    }

    try {
      const candidates = await searchGooglePlaceCandidates(`${parsed.stopQuery} ${activeRoute.label} Philippines`);
      const candidate = candidates[0];

      if (!candidate) {
        return {
          status: 'manual-pick-needed',
          message: `I could not find ${parsed.stopQuery} on Google Maps right now. Please use Pick Or Search Stop instead.`,
          initialSearch: parsed.stopQuery,
          suggestedStops: parsed.suggestions.map(stop => stop.name)
        };
      }

      const syntheticLocation = createSyntheticPlaceLocation(candidate);
      const nearestMatch = findNearestMappedStop(activeRoute.stops, syntheticLocation);
      const segmentMatch = findNearestMappedSegment(activeRoute.stops, syntheticLocation);
      const suggestedRadius = nearestMatch?.stop.radiusMeters ?? 60;
      const isExactStop =
        Boolean(nearestMatch) &&
        nearestMatch!.distanceMeters <= Math.max(suggestedRadius, 90) &&
        (!segmentMatch || Math.abs(segmentMatch.estimatedKm - nearestMatch!.stop.km) <= 0.1);

      if (isExactStop && nearestMatch) {
        return {
          status: 'exact-stop',
          stopName: nearestMatch.stop.name,
          matchedLabel: `${candidate.name} near ${nearestMatch.stop.name}`,
          matchConfidence: 'near-stop'
        };
      }

      if (segmentMatch) {
        return {
          status: 'manual-pick-needed',
          message: `I found ${candidate.name} between ${segmentMatch.startStop.name} and ${segmentMatch.endStop.name}. For drop-off alerts, please pick the exact KM-post stop manually so the bell rings safely.`,
          initialSearch: candidate.name,
          suggestedStops: [segmentMatch.startStop.name, segmentMatch.endStop.name]
        };
      }

      return {
        status: 'manual-pick-needed',
        message: `I found ${candidate.name}, but I could not safely map it to an exact stop on this route. Please use Pick Or Search Stop.`,
        initialSearch: candidate.name,
        suggestedStops: parsed.suggestions.map(stop => stop.name)
      };
    } catch (error) {
      return {
        status: 'manual-pick-needed',
        message: error instanceof Error
          ? error.message
          : 'Google place matching is not available right now. Please use Pick Or Search Stop.',
        initialSearch: parsed.stopQuery,
        suggestedStops: parsed.suggestions.map(stop => stop.name)
      };
    }
  };

  const handleReminderVoiceTranscript = async (
    transcript: string,
    currentStep: ReminderVoiceStep
  ) => {
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript) {
      return;
    }

    const normalizedTranscript = trimmedTranscript.toLowerCase();
    const shiftCommand = parseShiftVoiceCommand(trimmedTranscript);
    const followUp = parseStopReminderFollowUpTranscript(trimmedTranscript);

    if (shiftCommand.status === 'match') {
      clearVoiceSuggestions();
      if (shiftCommand.command === 'start-shift') {
        const startedShift = startShift('manual');
        const message = startedShift
          ? `Shift started at ${new Date(startedShift.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Say the stop and passenger count when ready.`
          : 'Shift is already open. Say the stop and passenger count when ready.';
        queueVoicePrompt(message, 'stop-and-count');
      } else {
        const closedShift = endShift();
        const message = closedShift
          ? `Shift ended at ${new Date(closedShift.endedAt ?? Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Say the stop and passenger count when ready, or say exit.`
          : 'No open shift to end right now. Say the stop and passenger count when ready.';
        queueVoicePrompt(message, 'stop-and-count');
      }
      return;
    }

    if (followUp.status === 'match') {
      if (followUp.command === 'exit') {
        closeVoiceAssistant('Drop-off voice assistant closed.');
        return;
      }

      if (followUp.command === 'repeat') {
        queueVoicePrompt(voiceFeedback ?? getListeningPrompt(currentStep), currentStep);
        return;
      }

      if (followUp.command === 'undo-last' || followUp.command === 'correct-last') {
        const undone = undoLastVoiceQueuedReminder();
        if (undone) {
          showToast('Last queued drop-off reminder removed', 'info');
          queueVoicePrompt('Okay, I removed the last queued stop. Please say the correct stop and passenger count.', 'stop-and-count');
        } else {
          queueVoicePrompt('There is no last queued stop to remove yet. Please say the stop and passenger count.', 'stop-and-count');
        }
        return;
      }

      if (followUp.command === 'pause-alerts') {
        clearVoiceSuggestions();
        setReminderSettings(prev => ({ ...prev, enabled: false }));
        queueVoicePrompt('Alerts are paused. Say resume alerts any time, or say the next stop and passenger count.', 'next-or-exit');
        return;
      }

      if (followUp.command === 'resume-alerts') {
        clearVoiceSuggestions();
        setReminderSettings(prev => ({ ...prev, enabled: true }));
        queueVoicePrompt('Alerts are on again. Say the next stop and passenger count, or say exit.', 'next-or-exit');
        return;
      }

      if (followUp.command === 'how-many-left') {
        clearVoiceSuggestions();
        const activeReminderCount = routeReminders.filter(reminder => reminder.status !== 'done').length;
        const activePassengerCount = routeReminders
          .filter(reminder => reminder.status !== 'done')
          .reduce((sum, reminder) => sum + reminder.passengerCount, 0);
        queueVoicePrompt(
          `${activeReminderCount} stop reminder${activeReminderCount === 1 ? '' : 's'} are still active for ${activePassengerCount} passenger${activePassengerCount === 1 ? '' : 's'}. Say the next stop and passenger count, or say exit.`,
          'next-or-exit'
        );
        return;
      }

      if (followUp.command === 'list-passengers') {
        clearVoiceSuggestions();
        if (routeReminders.length === 0) {
          queueVoicePrompt('No drop-off reminders are queued yet. Say a stop and passenger count like Anonas 2.', 'stop-and-count');
          return;
        }

        const reminderSummary = orderStopNamesByRouteContext(routeReminders.map(reminder => reminder.stopName))
          .map(stopName => {
            const reminder = routeReminders.find(entry => entry.stopName === stopName);
            return reminder ? `${stopName} ${reminder.passengerCount}` : null;
          })
          .filter(Boolean)
          .join(', ');
        queueVoicePrompt(`${reminderSummary}. Say the next stop and passenger count, or say exit.`, 'next-or-exit');
        return;
      }

      if (followUp.command === 'clear-all') {
        clearVoiceSuggestions();
        setPendingBulkVoiceAction('clear-all');
        queueVoicePrompt('Say confirm all to remove every queued reminder on this route, or say exit to keep them.', 'next-or-exit');
        return;
      }

      if (followUp.command === 'confirm-all') {
        clearVoiceSuggestions();
        if (pendingBulkVoiceAction === 'clear-all') {
          clearAllRouteReminders();
          setPendingBulkVoiceAction(null);
          queueVoicePrompt('All drop-off reminders for this route were cleared. Say the next stop and passenger count, or say exit.', 'stop-and-count');
        } else {
          setAllRouteRemindersEnabled(true);
          queueVoicePrompt('All queued reminders are enabled. Say the next stop and passenger count, or say exit.', 'next-or-exit');
        }
        return;
      }

      if (followUp.command === 'next-stop') {
        clearVoiceSuggestions();
        queueVoicePrompt('Okay. Please say the next stop and passenger count.', 'stop-and-count');
        return;
      }
    }

    if (/\b(mark done|done for|remove|delete)\b/.test(normalizedTranscript)) {
      const strippedQuery = trimmedTranscript.replace(/\b(mark done|done for|remove|delete)\b/ig, ' ').trim();
      const { reminder, suggestions } = findReminderByStopQuery(strippedQuery);

      if (!reminder) {
        if (suggestions.length > 0) {
          setSuggestedVoiceStops(suggestions);
        }
        queueVoicePrompt(
          suggestions.length > 0
            ? `I heard something close. Tap one of the suggested stops below, or say the stop again.`
            : 'I could not find that queued stop. Say the stop name again, or say list passengers.',
          'next-or-exit'
        );
        return;
      }

      if (/\b(mark done|done for)\b/.test(normalizedTranscript)) {
        clearVoiceSuggestions();
        markReminderDone(reminder.id);
        queueVoicePrompt(`${reminder.stopName} marked done. Say the next stop and passenger count, or say exit.`, 'next-or-exit');
        return;
      }

      clearVoiceSuggestions();
      removeReminder(reminder.id);
      queueVoicePrompt(`${reminder.stopName} removed from alerts. Say the next stop and passenger count, or say exit.`, 'next-or-exit');
      return;
    }

    if (currentStep === 'confirm') {
      const answer = parseVoiceBinaryAnswer(trimmedTranscript);
      if (answer === 'yes') {
        confirmPendingVoiceReminder();
        return;
      }

      const replacementTranscript = extractReplacementTranscript(trimmedTranscript);
      if (answer === 'no' && !replacementTranscript) {
        setPendingVoiceReminder(null);
        pendingVoiceReminderRef.current = null;
        queueVoicePrompt('Okay. Please say the correct stop and passenger count.', 'stop-and-count');
        return;
      }

      const correctedTranscript = replacementTranscript || trimmedTranscript;
      const correctedReminder = parseStopReminderVoiceTranscript(correctedTranscript, activeRoute);

      if (correctedReminder.status === 'match') {
        const resolvedStop = await resolveVoiceStopToRoute({
          ...correctedReminder,
          passengerCount:
            correctedReminder.passengerCount ??
            pendingVoiceReminderRef.current?.passengerCount ??
            null
        });

        if (resolvedStop.status !== 'exact-stop') {
          openVoiceStopPickerFallback(resolvedStop.message, {
            initialSearch: resolvedStop.initialSearch,
            suggestedStops: resolvedStop.suggestedStops,
            helperMessage: resolvedStop.message,
            passengerCountValue:
              correctedReminder.passengerCount ?? pendingVoiceReminderRef.current?.passengerCount ?? null
          });
          return;
        }

        const nextPassengerCount =
          correctedReminder.passengerCount ?? pendingVoiceReminderRef.current?.passengerCount ?? null;

        if (!nextPassengerCount) {
          setPendingVoiceStopName(resolvedStop.stopName);
          pendingVoiceStopNameRef.current = resolvedStop.stopName;
          setDraftStopName(resolvedStop.stopName);
          const nextPendingReminder = {
            stopName: resolvedStop.stopName,
            passengerCount: 0,
            matchConfidence: resolvedStop.matchConfidence,
            matchedLabel: resolvedStop.matchedLabel
          } satisfies PendingVoiceReminder;
          setPendingVoiceReminder(nextPendingReminder);
          pendingVoiceReminderRef.current = nextPendingReminder;
          setSuggestedVoiceStops(correctedReminder.suggestions.map(stop => stop.name));
          setVoicePlaceStatus(`${describeMatchConfidence(resolvedStop.matchConfidence)} - ${resolvedStop.matchedLabel}`);
          queueVoicePrompt(`I heard ${resolvedStop.stopName}. How many passengers are getting down there?`, 'count-only');
          return;
        }

        queueVoiceReminderConfirmation(
          resolvedStop.stopName,
          nextPassengerCount,
          resolvedStop.matchConfidence,
          resolvedStop.matchedLabel
        );
        return;
      }

      queueVoicePrompt('Okay. Please say the correct stop and passenger count.', 'stop-and-count');
      return;
    }

    if (currentStep === 'count-only') {
      const countResult = parsePassengerCountVoiceTranscript(trimmedTranscript);
      if (countResult.status !== 'match') {
        queueVoicePrompt(countResult.message, 'count-only');
        return;
      }

      const rememberedStopName = pendingVoiceStopNameRef.current ?? pendingVoiceStopName;
      if (!rememberedStopName) {
        queueVoicePrompt('Please say the stop and passenger count again.', 'stop-and-count');
        return;
      }

      queueVoiceReminderConfirmation(
        rememberedStopName,
        countResult.passengerCount,
        pendingVoiceReminderRef.current?.matchConfidence ?? 'exact-stop',
        pendingVoiceReminderRef.current?.matchedLabel ?? rememberedStopName
      );
      return;
    }

    const chainedReminders = parseStopReminderVoiceChainDetailed(trimmedTranscript, activeRoute);
    if (chainedReminders.segments.length > 1) {
      if (chainedReminders.unresolvedSegments.length > 0) {
        const firstUnresolvedSegment = chainedReminders.unresolvedSegments[0];
        const suggestionNames = findTopStopVoiceSuggestions(firstUnresolvedSegment, activeRoute).map(
          stop => stop.name
        );
        if (suggestionNames.length > 0) {
          setSuggestedVoiceStops(suggestionNames);
        } else {
          clearVoiceSuggestions();
        }
        queueVoicePrompt(
          'I heard multiple stops, but I could not safely finish all of them. Please say them again with a short pause or say "then", like "Anonas 1 then Rosales 2".',
          'stop-and-count'
        );
        return;
      }

      const resolvedEntries: ReminderQueueRequest[] = [];
      const queuedSummaries: string[] = [];

      for (const chainedReminder of chainedReminders.items) {
        const resolvedStop = await resolveVoiceStopToRoute({
          status: 'match',
          transcript: trimmedTranscript,
          normalized: chainedReminder.stopQuery,
          stopQuery: chainedReminder.stopQuery,
          passengerCount: chainedReminder.passengerCount,
          stop: chainedReminder.stop,
          stopMatchMode: chainedReminder.stopMatchMode,
          suggestions: chainedReminder.suggestions
        });

        if (resolvedStop.status !== 'exact-stop') {
          openVoiceStopPickerFallback(resolvedStop.message, {
            initialSearch: resolvedStop.initialSearch,
            suggestedStops: resolvedStop.suggestedStops,
            helperMessage: resolvedStop.message,
            passengerCountValue: chainedReminder.passengerCount
          });
          return;
        }

        resolvedEntries.push({
          stopName: resolvedStop.stopName,
          passengerCount: chainedReminder.passengerCount,
          matchConfidence: resolvedStop.matchConfidence,
          matchedPlaceLabel: resolvedStop.matchedLabel
        });
        queuedSummaries.push(`${resolvedStop.stopName} ${chainedReminder.passengerCount}`);
      }

      queueReminderEntries(resolvedEntries);
      setVoicePlaceStatus(`Queued ${queuedSummaries.length} stops`);
      queueVoicePrompt(
        `${queuedSummaries.join(', ')} queued. Say the next stop and passenger count, say undo, or say exit.`,
        'next-or-exit'
      );
      return;
    }

    const reminderResult = parseStopReminderVoiceTranscript(trimmedTranscript, activeRoute);
    if (reminderResult.status !== 'match') {
      const suggestionNames = (reminderResult.suggestions ?? findTopStopVoiceSuggestions(trimmedTranscript, activeRoute)).map(stop => stop.name);
      if (suggestionNames.length > 0) {
        setSuggestedVoiceStops(suggestionNames);
      } else {
        clearVoiceSuggestions();
      }
      queueVoicePrompt(reminderResult.message, 'stop-and-count');
      return;
    }

    const resolvedStop = await resolveVoiceStopToRoute(reminderResult);
    if (resolvedStop.status !== 'exact-stop') {
      openVoiceStopPickerFallback(resolvedStop.message, {
        initialSearch: resolvedStop.initialSearch,
        suggestedStops: resolvedStop.suggestedStops,
        helperMessage: resolvedStop.message,
        passengerCountValue: reminderResult.passengerCount
      });
      return;
    }

    if (!reminderResult.passengerCount) {
      setPendingVoiceStopName(resolvedStop.stopName);
      pendingVoiceStopNameRef.current = resolvedStop.stopName;
      setDraftStopName(resolvedStop.stopName);
      const nextPendingReminder = {
        stopName: resolvedStop.stopName,
        passengerCount: 0,
        matchConfidence: resolvedStop.matchConfidence,
        matchedLabel: resolvedStop.matchedLabel
      } satisfies PendingVoiceReminder;
      setPendingVoiceReminder(nextPendingReminder);
      pendingVoiceReminderRef.current = nextPendingReminder;
      setSuggestedVoiceStops(reminderResult.suggestions.map(stop => stop.name));
      setVoicePlaceStatus(`${describeMatchConfidence(resolvedStop.matchConfidence)} - ${resolvedStop.matchedLabel}`);
      queueVoicePrompt(`I heard ${resolvedStop.stopName}. How many passengers are getting down there?`, 'count-only');
      return;
    }

    queueVoiceReminderConfirmation(
      resolvedStop.stopName,
      reminderResult.passengerCount,
      resolvedStop.matchConfidence,
      resolvedStop.matchedLabel
    );
  };

  const startReminderVoiceRecognition = async (nextStep: ReminderVoiceStep = voiceStep) => {
    clearQueuedVoicePrompt();
    cancelVoiceReply();

    if (isVoiceListening) {
      voiceRecognitionRef.current?.stop();
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setVoiceFeedback('Voice command is not available in this browser. Use Chrome on Android for the best result.');
      return;
    }

    latestVoiceTranscriptRef.current = '';
    voiceTranscriptHandledRef.current = false;
    setVoiceStep(nextStep);
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceFeedback(getListeningPrompt(nextStep));

    const recognition = new RecognitionCtor();
    voiceRecognitionRef.current = recognition;
    recognition.lang = 'en-PH';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsVoiceListening(true);
    recognition.onresult = event => {
      const { transcript, confidence, hasFinal } = extractRecognitionTranscript(event);
      latestVoiceTranscriptRef.current = transcript;
      setVoiceTranscript(transcript);
      setVoiceConfidence(confidence);
      if (typeof confidence === 'number' && confidence < 0.45) {
        setVoiceShortCommandMode(true);
      } else if (typeof confidence === 'number' && confidence >= 0.7) {
        setVoiceShortCommandMode(false);
      }

      if (transcript) {
        setVoiceFeedback(`Heard: ${transcript}`);
      }

      if (hasFinal && transcript) {
        voiceTranscriptHandledRef.current = true;
        silentRetryCountRef.current = 0;
        void handleReminderVoiceTranscript(transcript, nextStep);
      }
    };
    recognition.onerror = event => {
      setVoiceFeedback(getSpeechRecognitionErrorMessage(event.error));
      setIsVoiceListening(false);
      voiceRecognitionRef.current = null;
    };
    recognition.onend = () => {
      setIsVoiceListening(false);
      voiceRecognitionRef.current = null;

      if (voiceTranscriptHandledRef.current) {
        voiceTranscriptHandledRef.current = false;
        return;
      }

      const latestTranscript = latestVoiceTranscriptRef.current.trim();
      if (latestTranscript) {
        silentRetryCountRef.current = 0;
        void handleReminderVoiceTranscript(latestTranscript, nextStep);
        return;
      }

      if (nextStep === 'confirm' && pendingVoiceReminderRef.current) {
        confirmPendingVoiceReminder();
        return;
      }

      if (silentRetryCountRef.current >= 1) {
        closeVoiceAssistant('No response heard. Drop-off voice assistant closed.');
        return;
      }

      silentRetryCountRef.current += 1;
      queueVoicePrompt(getNoSpeechPrompt(nextStep), nextStep);
    };

    try {
      recognition.start();
    } catch {
      setVoiceFeedback('Voice recognition could not start. Please try again.');
      setIsVoiceListening(false);
    }
  };

  const shouldShowVoiceCard =
    isVoiceListening ||
    Boolean(voiceFeedback) ||
    Boolean(voiceTranscript) ||
    Boolean(voicePlaceStatus) ||
    Boolean(pendingVoiceStopName) ||
    voiceSuggestions.length > 0 ||
    Boolean(lastVoiceQueuedAction);

  return (
    <div className="flex min-h-full flex-col bg-[#f8f6f6] pb-24 transition-all dark:bg-black">
      <header className="sticky top-0 z-40 flex shrink-0 items-center justify-between bg-primary px-6 py-4 shadow-md">
        <div className="flex items-center gap-3">
          <span className="material-icons text-2xl text-white">notifications_active</span>
          <div>
            <h1 className="text-xl font-medium tracking-tight text-white">Alerts</h1>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/75">{activeRoute.shortLabel}</p>
          </div>
        </div>
        <button
          onClick={onExit}
          className="flex items-center justify-center rounded-xl bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
        >
          <span className="material-icons text-lg leading-none">close</span>
        </button>
      </header>

      <div className="space-y-5 p-4">
        <div className="grid grid-cols-3 gap-2 max-[360px]:gap-1.5">
          {[
            { key: 'enabled', label: 'Alerts', value: reminderSettings.enabled },
            { key: 'soundEnabled', label: 'Sound', value: reminderSettings.soundEnabled },
            { key: 'vibrationEnabled', label: 'Vibrate', value: reminderSettings.vibrationEnabled }
          ].map(item => (
            <button
              key={item.key}
              onClick={() => toggleReminderSetting(item.key as keyof typeof reminderSettings)}
              className={`rounded-2xl px-3 py-4 text-center transition-all ${
                item.value
                  ? 'bg-primary text-white'
                  : 'bg-white text-slate-500 shadow-sm dark:bg-night-charcoal dark:text-slate-300'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest">{item.label}</p>
              <p className="mt-2 text-xs font-black">{item.value ? 'ON' : 'OFF'}</p>
            </button>
          ))}
        </div>

        <div className="rounded-[1.75rem] bg-white px-4 py-4 shadow-sm dark:bg-night-charcoal">
          <HelpHint
            label="Drop-off alerts watch the selected KM-post stop while the app stays open. Queue the stop manually, or speak a stop and passenger count like Anonas 2."
            triggerClassName="inline-flex cursor-pointer rounded-md text-xs font-semibold text-slate-500 dark:text-slate-300"
          >
            Alerts work best while the app is open and GPS is allowed on the phone.
          </HelpHint>
        </div>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm dark:bg-night-charcoal">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <HelpHint
                label="Pick the exact KM-post stop for this drop-off. If you only know the place or landmark, search it first and then choose the nearest route stop."
                triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
              >
                Add Stop
              </HelpHint>
              <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-white">
                {draftStopName || 'Choose a drop-off stop'}
              </h2>
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                {draftStopName
                  ? 'Stop selected. Enter passengers, then tap Queue.'
                  : 'Pick the stop first, then enter the passenger count. Voice example: "Anonas 2".'}
              </p>
            </div>
            <button
              onClick={() => {
                clearVoiceState({ keepFeedback: false });
                setStopPickerInitialSearch('');
                setStopPickerSuggestedStops([]);
                setStopPickerHelperMessage(null);
                setIsStopPickerOpen(true);
              }}
              className="w-full shrink-0 rounded-[1.5rem] bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 sm:w-auto"
            >
              {draftStopName ? 'Change Stop' : 'Pick Or Search Stop'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={passengerCount}
              onChange={event => setPassengerCount(event.target.value)}
              className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-700 caret-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-black dark:text-white"
              placeholder="Passengers getting down"
            />
            <button
              onClick={handleAddReminder}
              disabled={!draftStopName}
              className="w-full rounded-[1.5rem] bg-slate-900 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 sm:w-auto"
            >
              Queue
            </button>
          </div>

          {shouldShowVoiceCard && (
            <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm dark:border-white/10 dark:bg-black/30">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary">Voice Drop-Off Assistant</p>
                  <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">{voiceFeedback}</p>
                  {voicePlaceStatus && (
                    <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">{voicePlaceStatus}</p>
                  )}
                  {voiceShortCommandMode && (
                    <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-300">
                      Short command mode is on. Say only the stop and count, like "Anonas 2".
                    </p>
                  )}
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

              <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-300">
                For multiple stops, say them with a short pause, a comma, or the word{' '}
                <span className="font-black text-slate-700 dark:text-slate-100">then</span>, like{' '}
                <span className="font-black text-slate-700 dark:text-slate-100">
                  Anonas 1 then Rosales 2
                </span>
                .
              </p>

              {voiceSuggestions.length > 0 && (
                <div className="mt-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Suggested exact stops</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {voiceSuggestions.map(stopName => (
                      <button
                        key={stopName}
                        onClick={() => applyVoiceSuggestion(stopName)}
                        className="rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-primary active:scale-95"
                      >
                        {stopName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  onClick={() => void startReminderVoiceRecognition(voiceStep)}
                  className="rounded-[1.25rem] bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                  Ask Again
                </button>
                {lastVoiceQueuedAction && (
                  <button
                    onClick={() => {
                      const undone = undoLastVoiceQueuedReminder();
                      if (undone) {
                        showToast('Last queued drop-off reminder removed', 'info');
                      }
                    }}
                    className="rounded-[1.25rem] border border-primary/20 bg-primary/[0.08] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary active:scale-95"
                  >
                    Undo Last
                  </button>
                )}
                <button
                  onClick={() => closeVoiceAssistant('Drop-off voice assistant closed.')}
                  className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  Exit Voice
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm dark:bg-night-charcoal">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <HelpHint
                label="These are the stops currently being watched for reminders. You can turn each one on or off, mark it done, or remove it."
                triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
              >
                Queued Stops
              </HelpHint>
              <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-white">{routeReminders.length} saved</h2>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary">
              {reminderSettings.enabled ? 'Monitoring' : 'Paused'}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {routeReminders.length === 0 && (
              <div className="rounded-[1.5rem] bg-slate-50 px-4 py-6 text-center dark:bg-black/30">
                <p className="text-sm font-bold text-slate-500 dark:text-slate-300">
                  No drop-off reminders queued for this route yet.
                </p>
              </div>
            )}

            {routeReminders.map(reminder => {
              const reminderStop = activeRoute.stops.find(stop => stop.name === reminder.stopName);
              const statusLabel =
                reminder.status === 'done'
                  ? 'Completed'
                  : reminder.alertsTriggered.arrival
                    ? 'Arriving now'
                    : reminder.alertsTriggered.oneMinute
                      ? '1 min alerted'
                      : reminder.alertsTriggered.twoMinute
                        ? '2 min alerted'
                        : 'Queued';
              const confidenceLabel = describeMatchConfidence(reminder.matchConfidence ?? 'exact-stop');

              return (
                <div
                  key={reminder.id}
                  className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-black/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{reminder.stopName}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {reminderStop ? `KM ${reminderStop.km}` : 'Stop queued'} | {reminder.passengerCount} passenger{reminder.passengerCount > 1 ? 's' : ''}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">{statusLabel}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${
                          (reminder.matchConfidence ?? 'exact-stop') === 'near-stop'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'
                            : (reminder.matchConfidence ?? 'exact-stop') === 'manual-pick'
                              ? 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
                        }`}>
                          {confidenceLabel}
                        </span>
                        {reminder.matchedPlaceLabel && reminder.matchedPlaceLabel !== reminder.stopName ? (
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                            {reminder.matchedPlaceLabel}
                          </span>
                        ) : null}
                      </div>
                      {reminder.lastEtaSeconds ? (
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          Last ETA {formatEta(reminder.lastEtaSeconds)}
                        </p>
                      ) : null}
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={reminder.enabled}
                        onChange={() => toggleReminder(reminder.id)}
                        className="peer sr-only"
                      />
                      <div className="h-6 w-11 rounded-full bg-slate-200 transition-all after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full dark:bg-slate-700" />
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <button
                      onClick={() => markReminderDone(reminder.id)}
                      className="rounded-[1.2rem] bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                    >
                      Mark Done
                    </button>
                    <button
                      onClick={() => removeReminder(reminder.id)}
                      className="rounded-[1.2rem] border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:text-slate-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <StopPickerOverlay
        isOpen={isStopPickerOpen}
        onClose={() => {
          setIsStopPickerOpen(false);
          setStopPickerInitialSearch('');
          setStopPickerSuggestedStops([]);
          setStopPickerHelperMessage(null);
          setPendingStopPickerQueue(null);
        }}
        onSelect={(name) => {
          clearVoiceState({ keepFeedback: false });
          if (pendingStopPickerQueue) {
            queueReminderForStop(name, pendingStopPickerQueue.passengerCount, {
              matchConfidence: 'manual-pick',
              matchedPlaceLabel: pendingStopPickerQueue.matchedPlaceLabel ?? name
            });
            setVoicePlaceStatus(`Manual Pick - ${name}`);
            showToast(
              `${name} queued for ${pendingStopPickerQueue.passengerCount} passenger${pendingStopPickerQueue.passengerCount === 1 ? '' : 's'}`
            );
          } else {
            setDraftStopName(name);
            showToast(`Drop-off set to ${name}`);
          }
          setIsStopPickerOpen(false);
          setStopPickerInitialSearch('');
          setStopPickerSuggestedStops([]);
          setStopPickerHelperMessage(null);
          setPendingStopPickerQueue(null);
        }}
        title="Drop-Off Stop"
        initialSearch={stopPickerInitialSearch}
        suggestedStops={stopPickerSuggestedStops}
        helperMessage={stopPickerHelperMessage}
      />
      <FloatingVoiceButton
        active={isVoiceListening}
        disabled={!canUseVoiceRecognition || !settings.floatingVoiceEnabled}
        label="Drop-off Voice Assistant"
        title={
          canUseVoiceRecognition
            ? 'Drop-off voice assistant'
            : 'Voice command is not available in this browser'
        }
        onActivate={() => {
          void startReminderVoiceRecognition(voiceStep);
        }}
      />
    </div>
  );
};

export default AlertsScreen;
