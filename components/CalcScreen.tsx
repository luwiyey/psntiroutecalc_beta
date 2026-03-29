import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import StopPickerOverlay from './StopPickerOverlay';
import ManualKMOverlay from './ManualKMOverlay';
import ConductorCalcOverlay, { type VoiceChangePreset } from './ConductorCalcOverlay';
import FloatingVoiceButton from './FloatingVoiceButton';
import LocationAssistOverlay from './LocationAssistOverlay';
import HelpHint from './HelpHint';
import { calculateFare, formatFareRate } from '../utils/fare';
import { consumePendingMapsReturnRefresh } from '../utils/google-maps';
import type { MapPickerPoint } from './MapPickerOverlay';
import { useAuth } from '../context/AuthContext';
import type {
  CurrentLocationSnapshot,
  LocationPermissionState,
  SegmentMatch,
  StopMatch
} from '../utils/location';
import {
  findNearestMappedSegment,
  findNearestMappedStop,
  getDistanceMeters,
  getLocationErrorMessage,
  getLocationReliabilityMessage,
  hasRouteCoordinates,
  isLikelyInAppBrowser,
  openCurrentPageInChrome,
  queryLocationPermissionState,
  requestBestCurrentLocation
} from '../utils/location';
import {
  hasGoogleMapsAssistConfig,
  snapLocationToRoad
} from '../utils/google-maps-assist';
import type {
  BrowserSpeechRecognition,
  FareConversationShortcut,
  FareTypeVoiceAnswer,
  FareVoiceParseResult
} from '../utils/voice';
import {
  cancelVoiceReply,
  extractRecognitionTranscript,
  formatVoiceConfidence,
  getSpeechRecognitionCtor,
  getSpeechRecognitionErrorMessage,
  parseFareConversationShortcut,
  parseVoiceBinaryAnswer,
  parseCashVoiceTranscript,
  parseFareTypeVoiceAnswer,
  parseFareVoiceTranscript,
  speakVoiceReply
} from '../utils/voice';
import { trackAnalyticsEvent } from '../utils/analytics';

const peso = '\u20B1';
const RECENT_FARE_LIMIT = 4;
type VoiceAssistantStep = 'fare' | 'fare-type' | 'cash' | 'next-passenger' | 'confirm';
type MatchedFareVoiceResult = Extract<FareVoiceParseResult, { status: 'match' }>;
type VoiceConfirmationAction =
  | {
      kind: 'fare-match';
      matchedFare: MatchedFareVoiceResult;
      retryStep: 'fare' | 'fare-type';
    }
  | {
      kind: 'cash-amount';
      matchedFare: MatchedFareVoiceResult;
      cashAmount: number;
      retryStep: 'cash';
    };
const MapPickerOverlay = React.lazy(() => import('./MapPickerOverlay'));

const CalcScreen: React.FC = () => {
  const {
    activeRoute,
    origin,
    destination,
    setOrigin,
    setDestination,
    history,
    addRecord,
    setActiveFare,
    showToast
  } = useApp();
  const { authState } = useAuth();
  const [isOriginPickerOpen, setIsOriginPickerOpen] = useState(false);
  const [isDestPickerOpen, setIsDestPickerOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isConductorCalcOpen, setIsConductorCalcOpen] = useState(false);
  const [isLocationAssistOpen, setIsLocationAssistOpen] = useState(false);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState<LocationPermissionState>('unknown');
  const [currentLocation, setCurrentLocation] = useState<CurrentLocationSnapshot | null>(null);
  const [nearestStopMatch, setNearestStopMatch] = useState<StopMatch | null>(null);
  const [nearestSegmentMatch, setNearestSegmentMatch] = useState<SegmentMatch | null>(null);
  const [manualPrefill, setManualPrefill] = useState<{ pickupKm?: number; destKm?: number } | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [voiceResult, setVoiceResult] = useState<FareVoiceParseResult | null>(null);
  const [voiceStep, setVoiceStep] = useState<VoiceAssistantStep>('fare');
  const [pendingVoiceFare, setPendingVoiceFare] = useState<MatchedFareVoiceResult | null>(null);
  const [voiceCashAmount, setVoiceCashAmount] = useState<number | null>(null);
  const [voiceChangePreset, setVoiceChangePreset] = useState<VoiceChangePreset | null>(null);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const queuedVoicePromptRef = useRef<{ message: string; nextStep: VoiceAssistantStep | null } | null>(null);
  const queuedVoiceTimeoutRef = useRef<number | null>(null);
  const voiceSilenceTimeoutRef = useRef<number | null>(null);
  const latestVoiceTranscriptRef = useRef('');
  const latestVoiceConfidenceRef = useRef<number | null>(null);
  const voiceTranscriptHandledRef = useRef(false);
  const lastResolvedVoiceFareRef = useRef<MatchedFareVoiceResult | null>(null);
  const lastVoiceCashAmountRef = useRef<number | null>(null);
  const pendingVoiceConfirmationRef = useRef<VoiceConfirmationAction | null>(null);
  const inAppBrowser = useMemo(() => isLikelyInAppBrowser(), []);
  const canUseVoiceRecognition = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  const routeStart = activeRoute.stops[0];
  const routeEnd = activeRoute.stops[activeRoute.stops.length - 1];
  const routeHasMappedStops = useMemo(() => hasRouteCoordinates(activeRoute.stops), [activeRoute.stops]);
  const originStop = activeRoute.stops.find(stop => stop.name === origin) || routeStart;
  const destStop = activeRoute.stops.find(stop => stop.name === destination) || routeEnd;

  const distance = useMemo(() => Math.abs(destStop.km - originStop.km), [destStop.km, originStop.km]);
  const direction = useMemo(() => {
    if (originStop.km === destStop.km) return null;
    return destStop.km > originStop.km
      ? `Northbound (Toward ${routeEnd.name})`
      : `Southbound (Toward ${routeStart.name})`;
  }, [destStop.km, originStop.km, routeEnd.name, routeStart.name]);
  const calculation = useMemo(
    () => calculateFare(distance, activeRoute.fare),
    [activeRoute.fare, distance]
  );

  useEffect(() => {
    setActiveFare(calculation.reg);
  }, [calculation.reg, setActiveFare]);

  useEffect(() => {
    if (!currentLocation) {
      setNearestStopMatch(null);
      setNearestSegmentMatch(null);
      return;
    }

    setNearestStopMatch(findNearestMappedStop(activeRoute.stops, currentLocation));
    setNearestSegmentMatch(findNearestMappedSegment(activeRoute.stops, currentLocation));
  }, [activeRoute.stops, currentLocation]);

  useEffect(() => {
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceFeedback(null);
    setVoiceResult(null);
    setVoiceStep('fare');
    setPendingVoiceFare(null);
    setVoiceCashAmount(null);
    setVoiceChangePreset(null);
    setIsVoiceListening(false);
    cancelVoiceReply();
    if (voiceSilenceTimeoutRef.current) {
      window.clearTimeout(voiceSilenceTimeoutRef.current);
      voiceSilenceTimeoutRef.current = null;
    }
    if (queuedVoiceTimeoutRef.current) {
      window.clearTimeout(queuedVoiceTimeoutRef.current);
      queuedVoiceTimeoutRef.current = null;
    }
    queuedVoicePromptRef.current = null;
    latestVoiceTranscriptRef.current = '';
    latestVoiceConfidenceRef.current = null;
    voiceTranscriptHandledRef.current = false;
    lastResolvedVoiceFareRef.current = null;
    lastVoiceCashAmountRef.current = null;
    pendingVoiceConfirmationRef.current = null;
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
  }, [activeRoute.id]);

  useEffect(() => {
    return () => {
      cancelVoiceReply();
      if (voiceSilenceTimeoutRef.current) {
        window.clearTimeout(voiceSilenceTimeoutRef.current);
        voiceSilenceTimeoutRef.current = null;
      }
      if (queuedVoiceTimeoutRef.current) {
        window.clearTimeout(queuedVoiceTimeoutRef.current);
        queuedVoiceTimeoutRef.current = null;
      }
      queuedVoicePromptRef.current = null;
      latestVoiceTranscriptRef.current = '';
      latestVoiceConfidenceRef.current = null;
      voiceTranscriptHandledRef.current = false;
      pendingVoiceConfirmationRef.current = null;
      voiceRecognitionRef.current?.abort();
      voiceRecognitionRef.current = null;
    };
  }, []);

  const fareGuide = useMemo(() => {
    const previousFare = activeRoute.fare.previousFare;
    const sections: { title: string; rows: { label: string; value: string }[] }[] = [];
    const minimumRows =
      typeof activeRoute.fare.minimumRegularFare === 'number' &&
      typeof activeRoute.fare.minimumDiscountFare === 'number'
        ? [
            { label: 'Regular', value: `${activeRoute.fare.minimumRegularFare.toFixed(0)}` },
            { label: 'Discounted', value: `${activeRoute.fare.minimumDiscountFare.toFixed(0)}` }
          ]
        : [];

    if (previousFare) {
      const regularIncrease = activeRoute.fare.regularRate - previousFare.regularRate;
      const discountedIncrease = activeRoute.fare.discountRate - previousFare.discountRate;

      if (minimumRows.length > 0) {
        sections.push({
          title: 'Minimum Fare',
          rows: minimumRows
        });
      }

      sections.push({
        title: 'Rate Beyond Minimum',
        rows: [
          { label: 'Regular', value: `+${regularIncrease.toFixed(2)} per km` },
          { label: 'Discounted', value: `+${discountedIncrease.toFixed(2)} per km` }
        ]
      });

      sections.push({
        title: 'Current Rate',
        rows: [
          { label: 'Regular', value: `${formatFareRate(activeRoute.fare.regularRate)} per km` },
          { label: 'Discounted', value: `${formatFareRate(activeRoute.fare.discountRate)} per km` }
        ]
      });

      return {
        sections,
        note: 'Final: Rounded to peso.'
      };
    }

    if (
      typeof activeRoute.fare.minimumRegularFare === 'number' &&
      typeof activeRoute.fare.minimumDiscountFare === 'number'
    ) {
      sections.push({
        title: 'Minimum Fare',
        rows: minimumRows
      });
    }

    sections.push({
      title: 'Current Rate',
      rows: [
        { label: 'Regular', value: `${formatFareRate(activeRoute.fare.regularRate)} per km` },
        { label: 'Discounted', value: `${formatFareRate(activeRoute.fare.discountRate)} per km` }
      ]
    });

    return {
      sections,
      note: 'Final: Rounded to peso.'
  };
  }, [activeRoute]);

  const routeRecentFares = useMemo(() => {
    const seen = new Set<string>();

    return history
      .filter(record => record.routeId === activeRoute.id && record.type !== 'tally')
      .filter(record => {
        const key = `${record.origin}::${record.destination}`;
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .slice(0, RECENT_FARE_LIMIT);
  }, [activeRoute.id, history]);
  const lastRouteFare = routeRecentFares[0] ?? null;

  const formatKM = (km: number) => {
    return km % 1 === 0 ? km.toFixed(0) : km.toFixed(1);
  };

  const routeMapSeed = useMemo<MapPickerPoint>(() => {
    const mappedStops = activeRoute.stops.filter(
      stop => typeof stop.latitude === 'number' && typeof stop.longitude === 'number'
    );
    const seededStop = mappedStops[0] ?? routeStart;

    return {
      latitude: typeof seededStop.latitude === 'number' ? seededStop.latitude : 16.4023,
      longitude: typeof seededStop.longitude === 'number' ? seededStop.longitude : 120.596,
      placeId: seededStop.googlePlaceId ?? null,
      label: seededStop.name,
      source: 'manual'
    };
  }, [activeRoute.stops, routeStart]);

  const applyResolvedLocation = (nextLocation: CurrentLocationSnapshot) => {
    const nextNearestStop = findNearestMappedStop(activeRoute.stops, nextLocation);
    const nextSegmentMatch = findNearestMappedSegment(activeRoute.stops, nextLocation);
    const nextLocationWarning = getLocationReliabilityMessage(nextLocation);

    setCurrentLocation(nextLocation);
    setNearestStopMatch(nextNearestStop);
    setNearestSegmentMatch(nextSegmentMatch);
    setLocationError(null);
    setLocationWarning(nextLocationWarning);

    return {
      nextNearestStop,
      nextSegmentMatch,
      nextLocationWarning
    };
  };

  const buildSnapEligibleLocation = async (location: CurrentLocationSnapshot) => {
    if (!hasGoogleMapsAssistConfig() || location.accuracy > 150) {
      return location;
    }

    try {
      const snappedPoint = await snapLocationToRoad([location]);
      if (!snappedPoint) {
        return location;
      }

      const driftMeters = getDistanceMeters(
        location.latitude,
        location.longitude,
        snappedPoint.latitude,
        snappedPoint.longitude
      );

      if (driftMeters > 180) {
        return location;
      }

      return {
        ...location,
        latitude: snappedPoint.latitude,
        longitude: snappedPoint.longitude
      };
    } catch {
      return location;
    }
  };

  const openLocationMapPicker = () => {
    clearVisibleVoiceState();
    setIsLocationAssistOpen(true);
    setIsMapPickerOpen(true);
  };

  const handleSwap = () => {
    clearVisibleVoiceState();
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const handleSave = () => {
    if (distance === 0) return;
    addRecord({
      origin,
      destination,
      distance,
      regularFare: calculation.reg,
      discountedFare: calculation.disc,
      isFavorite: false
    });
    showToast('Fare saved to logs');
  };

  const handleFavorite = () => {
    if (distance === 0) return;
    addRecord({
      origin,
      destination,
      distance,
      regularFare: calculation.reg,
      discountedFare: calculation.disc,
      isFavorite: true
    });
    showToast('Saved to Favorites');
  };

  const handleReset = () => {
    clearVisibleVoiceState();
    setOrigin(routeStart.name);
    setDestination(routeEnd.name);
    showToast(`Reset to ${activeRoute.shortLabel}`);
  };

  const applyRecentFare = (nextOrigin: string, nextDestination: string) => {
    clearVisibleVoiceState();
    setOrigin(nextOrigin);
    setDestination(nextDestination);
    showToast(`Loaded ${nextOrigin} to ${nextDestination}`);
  };

  const clearQueuedVoicePrompt = () => {
    queuedVoicePromptRef.current = null;
    if (queuedVoiceTimeoutRef.current) {
      window.clearTimeout(queuedVoiceTimeoutRef.current);
      queuedVoiceTimeoutRef.current = null;
    }
  };

  const clearVoiceSilenceTimeout = () => {
    if (voiceSilenceTimeoutRef.current) {
      window.clearTimeout(voiceSilenceTimeoutRef.current);
      voiceSilenceTimeoutRef.current = null;
    }
  };

  const clearVisibleVoiceState = (options?: { keepMemory?: boolean }) => {
    const keepMemory = options?.keepMemory ?? true;

    clearQueuedVoicePrompt();
    clearVoiceSilenceTimeout();
    cancelVoiceReply();
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
    latestVoiceTranscriptRef.current = '';
    latestVoiceConfidenceRef.current = null;
    voiceTranscriptHandledRef.current = false;
    pendingVoiceConfirmationRef.current = null;
    setIsVoiceListening(false);
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceFeedback(null);
    setVoiceResult(null);
    setPendingVoiceFare(null);
    setVoiceCashAmount(null);
    setVoiceChangePreset(null);
    setVoiceStep('fare');

    if (!keepMemory) {
      lastResolvedVoiceFareRef.current = null;
      lastVoiceCashAmountRef.current = null;
    }
  };

  const closeVoicePanelAfterReply = (message: string) => {
    clearQueuedVoicePrompt();
    clearVoiceSilenceTimeout();
    cancelVoiceReply();
    setIsVoiceListening(false);
    setVoiceFeedback(message);
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setPendingVoiceFare(null);
    setVoiceCashAmount(null);
    setVoiceChangePreset(null);
    setVoiceStep('fare');
    pendingVoiceConfirmationRef.current = null;

    const hidePanel = () => {
      setVoiceFeedback(null);
      setVoiceTranscript('');
      setVoiceConfidence(null);
      setVoiceResult(null);
      setPendingVoiceFare(null);
      setVoiceCashAmount(null);
      setVoiceChangePreset(null);
      setVoiceStep('fare');
    };

    const started = speakVoiceReply(message, {
      onEnd: hidePanel,
      onError: hidePanel
    });

    if (!started) {
      window.setTimeout(hidePanel, 200);
    }
  };

  const getListeningPrompt = (step: VoiceAssistantStep) => {
    switch (step) {
      case 'fare':
        return lastResolvedVoiceFareRef.current
          ? 'Listening... say a fare like "Bayambang to Baguio discounted", or say same route.'
          : 'Listening... say a fare like "Bayambang to Baguio discounted".';
      case 'fare-type':
        return 'Listening... say regular or discounted.';
      case 'cash':
        return lastVoiceCashAmountRef.current
          ? `Listening... say how much is their money, or say same amount for ${lastVoiceCashAmountRef.current} pesos.`
          : 'Listening... say how much is their money, like "one thousand pesos".';
      case 'next-passenger':
        return 'Listening... say next passenger, same route, or exit.';
      case 'confirm':
        return 'Listening... say yes to confirm or no to try again.';
    }
  };

  const getNoSpeechPrompt = (step: VoiceAssistantStep) => {
    switch (step) {
      case 'fare':
        return 'I am still here. Please say the pickup and destination again, or say same route.';
      case 'fare-type':
        return 'I am still here. Please say regular or discounted. I will keep waiting for your answer.';
      case 'cash':
        return lastVoiceCashAmountRef.current
          ? `I am still here. Please say how much is their money, or say same amount for ${lastVoiceCashAmountRef.current} pesos.`
          : 'I am still here. Please say how much is their money, or say exit.';
      case 'next-passenger':
        return 'I am still here. Please say next passenger, same route, or exit.';
      case 'confirm':
        return 'I am still here. Please say yes to confirm or no to try again.';
    }
  };

  const getVoiceSilenceDelay = (step: VoiceAssistantStep, hasFinal: boolean) => {
    if (hasFinal) {
      return step === 'cash' ? 2200 : step === 'fare-type' ? 1700 : step === 'next-passenger' ? 1500 : 1100;
    }

    switch (step) {
      case 'cash':
        return 6500;
      case 'next-passenger':
        return 4500;
      case 'fare-type':
        return 5600;
      case 'fare':
      default:
        return 4200;
    }
  };

  const queueVoicePrompt = (message: string, nextStep: VoiceAssistantStep | null) => {
    clearQueuedVoicePrompt();
    queuedVoicePromptRef.current = { message, nextStep };
  };

  const shouldConfirmVoiceInterpretation = (confidence: number | null) =>
    typeof confidence === 'number' && !Number.isNaN(confidence) && confidence < 0.45;

  const queueVoiceConfirmation = (message: string, action: VoiceConfirmationAction) => {
    pendingVoiceConfirmationRef.current = action;
    setVoiceStep('confirm');
    setVoiceFeedback(message);
    queueVoicePrompt(message, 'confirm');
  };

  const applyVoiceRouteSelection = (matchedFare: MatchedFareVoiceResult) => {
    setOrigin(matchedFare.originStop.name);
    setDestination(matchedFare.destinationStop.name);
  };

  const getResolvedFareAmount = (matchedFare: MatchedFareVoiceResult) =>
    matchedFare.fareType === 'discounted' ? matchedFare.discountedFare : matchedFare.regularFare;

  const getResolvedFareLabel = (matchedFare: MatchedFareVoiceResult) =>
    matchedFare.fareType === 'discounted' ? 'Discounted' : 'Regular';

  const resolveVoiceFareType = (
    matchedFare: MatchedFareVoiceResult,
    nextFareType: FareTypeVoiceAnswer
  ): MatchedFareVoiceResult => ({
    ...matchedFare,
    fareType: nextFareType
  });

  const applyVoiceShortcut = (
    shortcut: FareConversationShortcut,
    confidence: number | null,
    currentStep: VoiceAssistantStep
  ) => {
    if (shortcut.command === 'new-route') {
      const nextMessage = `Okay. Say the new pickup and destination, like ${routeStart.name} to ${routeEnd.name}.`;
      setVoiceStep('fare');
      setVoiceFeedback(nextMessage);
      queueVoicePrompt(nextMessage, 'fare');
      return true;
    }

    if (shortcut.command === 'same-route') {
      const rememberedFare = lastResolvedVoiceFareRef.current;
      if (!rememberedFare) {
        const nextMessage = `I do not have a previous route yet. Please say the route first, like ${routeStart.name} to ${routeEnd.name}.`;
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'fare');
        return true;
      }

      const nextMatchedFare =
        shortcut.fareType && rememberedFare.fareType !== shortcut.fareType
          ? resolveVoiceFareType(rememberedFare, shortcut.fareType)
          : rememberedFare;

      const prompt = `I heard same route. Use ${getResolvedFareLabel(nextMatchedFare).toLowerCase()} fare from ${nextMatchedFare.originStop.name} to ${nextMatchedFare.destinationStop.name}. Say yes or no.`;

      if (currentStep === 'fare' || shouldConfirmVoiceInterpretation(confidence)) {
        queueVoiceConfirmation(prompt, {
          kind: 'fare-match',
          matchedFare: nextMatchedFare,
          retryStep: 'fare'
        });
      } else {
        handleMatchedFare(nextMatchedFare, 'queued');
      }

      return true;
    }

    if (shortcut.command === 'same-cash') {
      const fareContext =
        pendingVoiceFare ??
        (voiceResult?.status === 'match' && voiceResult.fareType !== 'either'
          ? voiceResult
          : lastResolvedVoiceFareRef.current);
      const lastCashAmount = lastVoiceCashAmountRef.current;

      if (!fareContext || !lastCashAmount) {
        const nextMessage = 'I do not have the previous passenger money yet. Please say the amount now.';
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'cash');
        return true;
      }

      queueVoiceConfirmation(
        `Use the same passenger money again: ${lastCashAmount} pesos. Say yes or no.`,
        {
          kind: 'cash-amount',
          matchedFare: fareContext,
          cashAmount: lastCashAmount,
          retryStep: 'cash'
        }
      );
      return true;
    }

    return false;
  };

  const executeVoiceConfirmation = (action: VoiceConfirmationAction) => {
    pendingVoiceConfirmationRef.current = null;

    if (action.kind === 'fare-match') {
      handleMatchedFare(action.matchedFare, 'queued');
      return;
    }

    finishVoiceChangeFlow(action.matchedFare, action.cashAmount);
  };

  const speakPromptAndListen = (message: string, nextStep: VoiceAssistantStep) => {
    setVoiceFeedback(message);
    setVoiceStep(nextStep);
    clearQueuedVoicePrompt();

    const beginListening = () => {
      queuedVoiceTimeoutRef.current = null;
      startFareVoiceRecognition(nextStep);
    };

    cancelVoiceReply();
    const started = speakVoiceReply(message, {
      onEnd: beginListening,
      onError: beginListening
    });

    if (!started) {
      queuedVoiceTimeoutRef.current = window.setTimeout(beginListening, 250);
    }
  };

  const flushQueuedVoicePrompt = () => {
    const queuedPrompt = queuedVoicePromptRef.current;
    clearQueuedVoicePrompt();
    if (!queuedPrompt) return;

    if (!queuedPrompt.nextStep) {
      setVoiceFeedback(queuedPrompt.message);
      cancelVoiceReply();
      void speakVoiceReply(queuedPrompt.message);
      return;
    }

    speakPromptAndListen(queuedPrompt.message, queuedPrompt.nextStep);
  };

  const beginCashFollowUp = (
    matchedFare: MatchedFareVoiceResult,
    mode: 'queued' | 'immediate' = 'queued'
  ) => {
    pendingVoiceConfirmationRef.current = null;
    applyVoiceRouteSelection(matchedFare);
    lastResolvedVoiceFareRef.current = matchedFare;
    setVoiceResult(matchedFare);
    setPendingVoiceFare(matchedFare);
    setVoiceCashAmount(null);
    setVoiceChangePreset(null);
    setVoiceStep('cash');

    const fareAmount = getResolvedFareAmount(matchedFare);
    const sameCashHint = lastVoiceCashAmountRef.current ? ' You can also say same amount.' : '';
    const nextMessage = `${getResolvedFareLabel(matchedFare)} fare from ${matchedFare.originStop.name} to ${matchedFare.destinationStop.name} is ${fareAmount} pesos. How much is their money?${sameCashHint}`;

    if (mode === 'queued') {
      setVoiceFeedback(nextMessage);
      queueVoicePrompt(nextMessage, 'cash');
      return;
    }

    speakPromptAndListen(nextMessage, 'cash');
  };

  const beginNextPassengerFollowUp = (
    matchedFare: MatchedFareVoiceResult,
    cashAmount: number,
    changeAmount: number,
    summary: string
  ) => {
    pendingVoiceConfirmationRef.current = null;
    const nextMessage = `${summary} Next passenger or exit?`;
    setVoiceResult(matchedFare);
    setPendingVoiceFare(null);
    setVoiceCashAmount(cashAmount);
    setVoiceStep('next-passenger');
    setVoiceFeedback(nextMessage);
    queueVoicePrompt(nextMessage, 'next-passenger');
  };

  const finishVoiceChangeFlow = (matchedFare: MatchedFareVoiceResult, cashAmount: number) => {
    pendingVoiceConfirmationRef.current = null;
    applyVoiceRouteSelection(matchedFare);
    lastResolvedVoiceFareRef.current = matchedFare;
    lastVoiceCashAmountRef.current = cashAmount;
    setVoiceResult(matchedFare);
    setPendingVoiceFare(null);
    setVoiceCashAmount(cashAmount);

    const fareAmount = getResolvedFareAmount(matchedFare);
    const changeAmount = Number((cashAmount - fareAmount).toFixed(2));
    const summary =
      changeAmount >= 0
        ? `${getResolvedFareLabel(matchedFare)} fare is ${fareAmount} pesos. Passenger money is ${cashAmount} pesos. Change is ${changeAmount} pesos.`
        : `${getResolvedFareLabel(matchedFare)} fare is ${fareAmount} pesos. Passenger money is ${cashAmount} pesos. Still lacking ${Math.abs(changeAmount)} pesos.`;

    setVoiceFeedback(summary);
    setVoiceChangePreset({
      fareAmount,
      cashAmount,
      changeAmount,
      summary
    });
    setIsConductorCalcOpen(true);
    beginNextPassengerFollowUp(matchedFare, cashAmount, changeAmount, summary);
    showToast('Voice change result ready.', 'success');
  };

  const handleMatchedFare = (matchedFare: MatchedFareVoiceResult, mode: 'queued' | 'immediate' = 'queued') => {
    if (matchedFare.fareType === 'either') {
      applyVoiceRouteSelection(matchedFare);
      setVoiceResult(matchedFare);
      setPendingVoiceFare(matchedFare);
      setVoiceCashAmount(null);
      setVoiceChangePreset(null);
      setVoiceStep('fare-type');
      const nextMessage = `I heard ${matchedFare.originStop.name} to ${matchedFare.destinationStop.name}. Do you want regular or discounted fare?`;

      if (mode === 'queued') {
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'fare-type');
      } else {
        speakPromptAndListen(nextMessage, 'fare-type');
      }

      showToast('Voice route heard. Clarify regular or discounted.', 'info');
      return;
    }

    beginCashFollowUp(matchedFare, mode);
    showToast('Voice fare heard. Asking for passenger money.', 'success');
  };

  const applyVoiceFare = () => {
    if (!voiceResult || voiceResult.status !== 'match') return;

    if (voiceResult.fareType === 'either') {
      handleMatchedFare(voiceResult, 'immediate');
      return;
    }

    beginCashFollowUp(voiceResult, 'immediate');
  };

  const applyVoiceFareTypeChoice = (nextFareType: FareTypeVoiceAnswer) => {
    const baseFare =
      pendingVoiceFare ??
      (voiceResult?.status === 'match' ? voiceResult : null);

    if (!baseFare) {
      const nextMessage = `Please say the route first, like ${routeStart.name} to ${routeEnd.name}.`;
      setVoiceFeedback(nextMessage);
      speakPromptAndListen(nextMessage, 'fare');
      return;
    }

    beginCashFollowUp(resolveVoiceFareType(baseFare, nextFareType), 'immediate');
  };

  const handleVoiceConfirmationChoice = (confirmed: boolean) => {
    const pendingConfirmation = pendingVoiceConfirmationRef.current;
    if (!pendingConfirmation) {
      const nextMessage = 'There is nothing waiting for confirmation right now. Please say the route again.';
      setVoiceStep('fare');
      setVoiceFeedback(nextMessage);
      queueVoicePrompt(nextMessage, 'fare');
      return;
    }

    if (confirmed) {
      executeVoiceConfirmation(pendingConfirmation);
      return;
    }

    pendingVoiceConfirmationRef.current = null;
    setVoiceStep(pendingConfirmation.retryStep);
    const retryMessage =
      pendingConfirmation.retryStep === 'cash'
        ? 'Okay. Please say how much is their money again.'
        : pendingConfirmation.retryStep === 'fare-type'
          ? 'Okay. Please say regular or discounted again.'
          : 'Okay. Please say the route again.';
    setVoiceFeedback(retryMessage);
    queueVoicePrompt(retryMessage, pendingConfirmation.retryStep);
  };

  const handleUseSameRoute = () => {
    const rememberedFare = lastResolvedVoiceFareRef.current;
    if (!rememberedFare) {
      showToast('No previous route remembered yet.', 'info');
      return;
    }

    handleMatchedFare(rememberedFare, 'immediate');
  };

  const handleUseSameCashAmount = () => {
    const fareContext =
      pendingVoiceFare ??
      (voiceResult?.status === 'match' && voiceResult.fareType !== 'either'
        ? voiceResult
        : lastResolvedVoiceFareRef.current);
    const lastCashAmount = lastVoiceCashAmountRef.current;

    if (!fareContext || !lastCashAmount) {
      showToast('No previous passenger money remembered yet.', 'info');
      return;
    }

    finishVoiceChangeFlow(fareContext, lastCashAmount);
  };

  const processFareVoiceTranscript = (
    requestedStep: VoiceAssistantStep,
    transcript: string,
    confidence: number | null
  ) => {
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript) {
      return;
    }

    voiceTranscriptHandledRef.current = true;
    setVoiceTranscript(trimmedTranscript);
    setVoiceConfidence(confidence);

    if (/\b(cancel|stop|close|nevermind|never mind)\b/i.test(trimmedTranscript)) {
      pendingVoiceConfirmationRef.current = null;
      closeVoicePanelAfterReply('Voice assistant cancelled.');
      return;
    }

    if (/\b(are you still there|still there|nandiyan ka pa|naririnig mo ako|hello)\b/i.test(trimmedTranscript)) {
      const stillHereMessage =
        requestedStep === 'cash'
          ? 'Yes, I am still here. Please say how much is their money, or say same amount.'
          : requestedStep === 'next-passenger'
            ? 'Yes, I am still here. Please say next passenger, same route, or exit.'
            : getListeningPrompt(requestedStep);
      setVoiceFeedback(stillHereMessage);
      queueVoicePrompt(stillHereMessage, requestedStep);
      return;
    }

    if (requestedStep === 'confirm') {
      const confirmationAnswer = parseVoiceBinaryAnswer(trimmedTranscript);
      const pendingConfirmation = pendingVoiceConfirmationRef.current;

      if (!confirmationAnswer) {
        const nextMessage = 'Please say yes to confirm or no to try again.';
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'confirm');
        return;
      }

      if (!pendingConfirmation) {
        const nextMessage = 'There is nothing waiting for confirmation right now. Please say the route again.';
        setVoiceStep('fare');
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'fare');
        return;
      }

      if (confirmationAnswer === 'yes') {
        executeVoiceConfirmation(pendingConfirmation);
        return;
      }

      pendingVoiceConfirmationRef.current = null;
      setVoiceStep(pendingConfirmation.retryStep);
      const retryMessage =
        pendingConfirmation.retryStep === 'cash'
          ? 'Okay. Please say how much is their money again.'
          : pendingConfirmation.retryStep === 'fare-type'
            ? 'Okay. Please say regular or discounted again.'
            : 'Okay. Please say the route again.';
      setVoiceFeedback(retryMessage);
      queueVoicePrompt(retryMessage, pendingConfirmation.retryStep);
      return;
    }

    if (requestedStep === 'fare') {
      const shortcut = parseFareConversationShortcut(trimmedTranscript);
      if (shortcut && applyVoiceShortcut(shortcut, confidence, requestedStep)) {
        return;
      }

      const parsed = parseFareVoiceTranscript(trimmedTranscript, activeRoute);
      setVoiceResult(parsed);

      if (parsed.status === 'match') {
        if (shouldConfirmVoiceInterpretation(confidence)) {
          const confirmMessage =
            parsed.fareType === 'either'
              ? `I heard ${parsed.originStop.name} to ${parsed.destinationStop.name}. Say yes to continue or no to try again.`
              : `I heard ${getResolvedFareLabel(parsed).toLowerCase()} fare from ${parsed.originStop.name} to ${parsed.destinationStop.name}. Say yes or no.`;
          queueVoiceConfirmation(confirmMessage, {
            kind: 'fare-match',
            matchedFare: parsed,
            retryStep: 'fare'
          });
          return;
        }

        handleMatchedFare(parsed, 'queued');
        return;
      }

      setPendingVoiceFare(null);
      setVoiceCashAmount(null);
      setVoiceFeedback(parsed.message);
      queueVoicePrompt(parsed.message, 'fare');
      return;
    }

    if (requestedStep === 'fare-type') {
      const parsedFareType = parseFareTypeVoiceAnswer(trimmedTranscript);
      const baseFare =
        pendingVoiceFare ??
        (voiceResult?.status === 'match' ? voiceResult : null);

      if (!parsedFareType) {
        const nextMessage = 'Please say regular or discounted fare.';
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'fare-type');
        return;
      }

      if (!baseFare) {
        const nextMessage = `Please say the route first, like ${routeStart.name} to ${routeEnd.name}.`;
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'fare');
        return;
      }

      const resolvedFare = resolveVoiceFareType(baseFare, parsedFareType);
      if (shouldConfirmVoiceInterpretation(confidence)) {
        queueVoiceConfirmation(
          `I heard ${getResolvedFareLabel(resolvedFare).toLowerCase()} fare for ${resolvedFare.originStop.name} to ${resolvedFare.destinationStop.name}. Say yes or no.`,
          {
            kind: 'fare-match',
            matchedFare: resolvedFare,
            retryStep: 'fare-type'
          }
        );
        return;
      }

      beginCashFollowUp(resolvedFare, 'queued');
      return;
    }

    if (requestedStep === 'next-passenger') {
      const shortcut = parseFareConversationShortcut(trimmedTranscript);
      if (shortcut && applyVoiceShortcut(shortcut, confidence, 'fare')) {
        return;
      }

      const nextAnswer = parseVoiceBinaryAnswer(trimmedTranscript);

      if (nextAnswer === 'yes') {
        setVoiceStep('fare');
        setVoiceResult(null);
        setPendingVoiceFare(null);
        setVoiceCashAmount(null);
        setVoiceChangePreset(null);
        const nextMessage = lastResolvedVoiceFareRef.current
          ? 'Ready for the next passenger. Say same route, or say the new pickup and destination now.'
          : 'Ready for the next passenger. Say the pickup and destination now.';
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'fare');
        return;
      }

      if (nextAnswer === 'no') {
        closeVoicePanelAfterReply('Voice assistant closed. Tap the mic anytime when you are ready again.');
        return;
      }

      const nextMessage = 'Please say next passenger, same route, or exit.';
      setVoiceFeedback(nextMessage);
      queueVoicePrompt(nextMessage, 'next-passenger');
      return;
    }

    const shortcut = parseFareConversationShortcut(trimmedTranscript);
    if (shortcut && applyVoiceShortcut(shortcut, confidence, requestedStep)) {
      return;
    }

    const fareContext =
      pendingVoiceFare ??
      (voiceResult?.status === 'match' && voiceResult.fareType !== 'either'
        ? voiceResult
        : null);

    if (!fareContext) {
      const nextMessage = `Please say the route first, like ${routeStart.name} to ${routeEnd.name}.`;
      setVoiceFeedback(nextMessage);
      queueVoicePrompt(nextMessage, 'fare');
      return;
    }

    const cashResult = parseCashVoiceTranscript(trimmedTranscript);
    if (cashResult.status === 'match') {
      if (shouldConfirmVoiceInterpretation(confidence)) {
        queueVoiceConfirmation(
          `I heard ${cashResult.amount} pesos for the passenger money. Say yes or no.`,
          {
            kind: 'cash-amount',
            matchedFare: fareContext,
            cashAmount: cashResult.amount,
            retryStep: 'cash'
          }
        );
        return;
      }

      finishVoiceChangeFlow(fareContext, cashResult.amount);
      return;
    }

    setVoiceFeedback(cashResult.message);
    queueVoicePrompt(cashResult.message, 'cash');
  };

  const startFareVoiceRecognition = (requestedStep: VoiceAssistantStep = 'fare') => {
    if (isVoiceListening) {
      clearQueuedVoicePrompt();
      clearVoiceSilenceTimeout();
      cancelVoiceReply();
      voiceRecognitionRef.current?.stop();
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      const nextMessage = 'Voice command is not available in this browser. Use Chrome on Android for the best result.';
      setVoiceFeedback(nextMessage);
      showToast('Voice command needs Chrome on Android or a supported browser.', 'info');
      void speakVoiceReply(nextMessage);
      return;
    }

    clearQueuedVoicePrompt();
    clearVoiceSilenceTimeout();
    cancelVoiceReply();
    if (requestedStep !== 'confirm') {
      pendingVoiceConfirmationRef.current = null;
    }
    setVoiceStep(requestedStep);
    setVoiceTranscript('');
    setVoiceConfidence(null);
    latestVoiceTranscriptRef.current = '';
    latestVoiceConfidenceRef.current = null;
    voiceTranscriptHandledRef.current = false;
    if (requestedStep === 'fare') {
      setVoiceResult(null);
      setPendingVoiceFare(null);
      setVoiceCashAmount(null);
      setVoiceChangePreset(null);
    }

    const recognition = new RecognitionCtor();
    voiceRecognitionRef.current = recognition;
    recognition.lang = 'en-PH';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setIsVoiceListening(true);
      latestVoiceTranscriptRef.current = '';
      latestVoiceConfidenceRef.current = null;
      voiceTranscriptHandledRef.current = false;
      setVoiceFeedback(getListeningPrompt(requestedStep));
    };
    recognition.onerror = event => {
      clearVoiceSilenceTimeout();
      const nextMessage =
        event.error === 'no-speech'
          ? getNoSpeechPrompt(requestedStep)
          : getSpeechRecognitionErrorMessage(event.error);
      setVoiceFeedback(nextMessage);
      setIsVoiceListening(false);
      if (event.error !== 'no-speech') {
        showToast(nextMessage, 'info');
      }
      if (event.error === 'no-speech') {
        queueVoicePrompt(nextMessage, requestedStep);
        return;
      }
      void speakVoiceReply(nextMessage);
    };
    recognition.onresult = event => {
      const { transcript, confidence, hasFinal } = extractRecognitionTranscript(event);
      if (!transcript) {
        return;
      }

      latestVoiceTranscriptRef.current = transcript;
      latestVoiceConfidenceRef.current = confidence;
      setVoiceTranscript(transcript);
      setVoiceConfidence(confidence);
      setVoiceFeedback(hasFinal ? `Heard "${transcript}". Processing...` : `Heard "${transcript}".`);

      if (hasFinal) {
        clearVoiceSilenceTimeout();
      }
    };
    recognition.onend = () => {
      setIsVoiceListening(false);
      voiceRecognitionRef.current = null;
      clearVoiceSilenceTimeout();
      if (!voiceTranscriptHandledRef.current && latestVoiceTranscriptRef.current.trim()) {
        processFareVoiceTranscript(
          requestedStep,
          latestVoiceTranscriptRef.current,
          latestVoiceConfidenceRef.current
        );
      }
      latestVoiceTranscriptRef.current = '';
      latestVoiceConfidenceRef.current = null;
      voiceTranscriptHandledRef.current = false;
      flushQueuedVoicePrompt();
    };

    try {
      recognition.start();
    } catch {
      setIsVoiceListening(false);
      setVoiceFeedback('Voice recognition could not start. Please try again.');
    }
  };

  const requestCurrentLocation = async () => {
    clearVisibleVoiceState();
    setIsLocationAssistOpen(true);
    setIsLocating(true);
    setLocationError(null);
    setLocationWarning(null);
    setLocationPermission(await queryLocationPermissionState());
    void trackAnalyticsEvent({
      eventType: 'gps_requested',
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      routeId: activeRoute.id,
      routeLabel: activeRoute.label,
      appSurface: 'fare',
      metadata: {
        origin,
        destination,
        inAppBrowser
      }
    });

    if (!navigator.geolocation) {
      setIsLocating(false);
      setCurrentLocation(null);
      setNearestStopMatch(null);
      setNearestSegmentMatch(null);
      setLocationError('This device or browser does not support GPS location.');
      setLocationWarning(null);
      void trackAnalyticsEvent({
        eventType: 'gps_failed',
        employeeId: authState.employeeId,
        employeeName: authState.employeeName,
        deviceId: authState.deviceId,
        routeId: activeRoute.id,
        routeLabel: activeRoute.label,
        appSurface: 'fare',
        metadata: {
          reason: 'geolocation_unsupported'
        }
      });
      return;
    }

    try {
      const permissionState = await queryLocationPermissionState();
      setLocationPermission(permissionState);

      if (permissionState === 'denied') {
        setCurrentLocation(null);
        setNearestStopMatch(null);
        setNearestSegmentMatch(null);
        setLocationError(getLocationErrorMessage(new Error('Permission denied'), permissionState, inAppBrowser));
        setLocationWarning(null);
        void trackAnalyticsEvent({
          eventType: 'gps_failed',
          employeeId: authState.employeeId,
          employeeName: authState.employeeName,
          deviceId: authState.deviceId,
          routeId: activeRoute.id,
          routeLabel: activeRoute.label,
          appSurface: 'fare',
          metadata: {
            reason: 'permission_denied',
            permissionState,
            inAppBrowser
          }
        });
        return;
      }

      const nextLocation = await buildSnapEligibleLocation(await requestBestCurrentLocation());
      const { nextNearestStop, nextSegmentMatch, nextLocationWarning } = applyResolvedLocation(nextLocation);
      void trackAnalyticsEvent({
        eventType: 'gps_succeeded',
        employeeId: authState.employeeId,
        employeeName: authState.employeeName,
        deviceId: authState.deviceId,
        routeId: activeRoute.id,
        routeLabel: activeRoute.label,
        appSurface: 'fare',
        metadata: {
          accuracy: nextLocation.accuracy,
          reliabilityWarning: nextLocationWarning,
          nearestStop: nextNearestStop?.stop.name ?? null,
          nearestStopKm: nextNearestStop?.stop.km ?? null,
          segmentStart: nextSegmentMatch?.startStop.name ?? null,
          segmentEnd: nextSegmentMatch?.endStop.name ?? null,
          estimatedKm: nextSegmentMatch?.estimatedKm ?? null
        }
      });
    } catch (error) {
      const permissionState = await queryLocationPermissionState();
      setLocationPermission(permissionState);
      setCurrentLocation(null);
      setNearestStopMatch(null);
      setNearestSegmentMatch(null);
      setLocationWarning(null);
      setLocationError(
        getLocationErrorMessage(
          error instanceof Error || (typeof error === 'object' && error !== null && 'code' in error)
            ? (error as GeolocationPositionError | Error)
            : new Error('Location error'),
          permissionState,
          inAppBrowser
        )
      );
      void trackAnalyticsEvent({
        eventType: 'gps_failed',
        employeeId: authState.employeeId,
        employeeName: authState.employeeName,
        deviceId: authState.deviceId,
        routeId: activeRoute.id,
        routeLabel: activeRoute.label,
        appSurface: 'fare',
        metadata: {
          reason: 'location_error',
          permissionState,
          inAppBrowser,
          message:
            error instanceof Error
              ? error.message
              : typeof error === 'object' && error !== null && 'message' in error
                ? String((error as { message?: unknown }).message)
                : 'Unknown error'
        }
      });
    } finally {
      setIsLocating(false);
    }
  };

  const handleUseDetectedStop = (stopName: string) => {
    clearVisibleVoiceState();
    setOrigin(stopName);
    setIsLocationAssistOpen(false);
    showToast(`Pickup set to ${stopName}`);
  };

  const handleUseManualKmFromLocation = (pickupKm: number) => {
    clearVisibleVoiceState();
    setIsLocationAssistOpen(false);
    setManualPrefill({
      pickupKm,
      destKm: destStop.km
    });
    setIsManualOpen(true);
    showToast(`Manual KM opened at KM ${pickupKm.toFixed(2).replace(/\.?0+$/, '')}`);
  };

  const handleOpenInChrome = () => {
    showToast('Opening this page in Chrome...');
    void trackAnalyticsEvent({
      eventType: 'open_in_chrome',
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      routeId: activeRoute.id,
      routeLabel: activeRoute.label,
      appSurface: 'fare',
      metadata: {
        source: 'gps-assist'
      }
    });
    openCurrentPageInChrome();
  };

  const handleOpenManualKmWithoutEstimate = () => {
    setIsLocationAssistOpen(false);
    setManualPrefill({
      destKm: destStop.km
    });
    setIsManualOpen(true);
    showToast('Manual KM opened. Enter the pickup KM directly.');
  };

  const handleRecommendManualKmFromPlaceSearch = (pickupKm: number, placeLabel?: string) => {
    clearVisibleVoiceState();
    setIsOriginPickerOpen(false);
    setManualPrefill({
      pickupKm,
      destKm: destStop.km
    });
    setIsManualOpen(true);
    showToast(
      placeLabel
        ? `${placeLabel} is between KM posts. Manual KM opened at KM ${pickupKm.toFixed(2).replace(/\.?0+$/, '')}.`
        : `Manual KM opened at KM ${pickupKm.toFixed(2).replace(/\.?0+$/, '')}.`
    );
  };

  const handleUseCurrentPoint = () => {
    if (nearestSegmentMatch) {
      handleUseManualKmFromLocation(nearestSegmentMatch.estimatedKm);
      return;
    }

    if (nearestStopMatch) {
      handleUseDetectedStop(nearestStopMatch.stop.name);
      return;
    }

    handleOpenManualKmWithoutEstimate();
  };

  useEffect(() => {
    if (!isLocationAssistOpen) return undefined;

    const maybeRefreshFromMapsReturn = () => {
      if (isLocating) return;
      if (!consumePendingMapsReturnRefresh()) return;
      showToast('Back from Google Maps. Refreshing GPS...');
      void requestCurrentLocation();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        maybeRefreshFromMapsReturn();
      }
    };

    window.addEventListener('focus', maybeRefreshFromMapsReturn);
    window.addEventListener('pageshow', maybeRefreshFromMapsReturn);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', maybeRefreshFromMapsReturn);
      window.removeEventListener('pageshow', maybeRefreshFromMapsReturn);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLocationAssistOpen, isLocating, showToast, destStop.km]);

  const handleConfirmMapPoint = async (point: MapPickerPoint) => {
    setIsMapPickerOpen(false);

    const baseSnapshot: CurrentLocationSnapshot = {
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.source === 'google-place' ? 15 : 20,
      timestamp: Date.now(),
      source: 'browser',
      sampleCount: 1
    };

    const nextLocation = point.source === 'manual'
      ? await buildSnapEligibleLocation(baseSnapshot)
      : baseSnapshot;

    const { nextNearestStop, nextSegmentMatch } = applyResolvedLocation(nextLocation);

    if (nextNearestStop) {
      showToast(`Map point updated near ${nextNearestStop.stop.name}. Review the match before using it.`);
      return;
    }

    if (nextSegmentMatch) {
      showToast(`Map point updated near KM ${nextSegmentMatch.estimatedKm.toFixed(2).replace(/\.?0+$/, '')}.`);
      return;
    }

    showToast('Map point updated. Use Manual KM if this is not an exact tariff stop.');
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in bg-[#f8f6f6] dark:bg-black">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-primary px-6 py-4 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <span className="material-icons text-2xl">calculate</span>
          <div>
            <h1 className="text-xl font-medium tracking-tight">Fare Calculator</h1>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/75">
              {activeRoute.label}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setVoiceChangePreset(null);
            setIsConductorCalcOpen(true);
          }}
          className="bg-white text-primary px-4 py-2 rounded-xl flex items-center gap-2 shadow-md active:scale-95 transition-all"
        >
          <span className="text-lg font-black leading-none">{peso}</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Change</span>
        </button>
      </header>

      <div className="flex flex-col items-center mt-6 mb-4 gap-2 px-5">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={requestCurrentLocation}
            className="bg-white dark:bg-night-charcoal px-5 py-2 rounded-full border border-primary/10 shadow-sm active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="material-icons text-sm text-primary">my_location</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              Use Current Location
            </span>
          </button>
        </div>
        <button
          onClick={handleSwap}
          className="bg-[#eff6ff] dark:bg-white/5 px-8 py-2 rounded-full border border-[#dbeafe] dark:border-white/10 shadow-sm active:scale-95 transition-all"
        >
          <p className="text-[11px] font-900 text-[#1e40af] dark:text-blue-300 uppercase tracking-[0.2em] flex items-center gap-2">
            {origin} <span className="material-icons text-[10px]">swap_horiz</span> {destination}
          </p>
        </button>
        {direction ? (
          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1 text-center">
            <span className="material-icons text-[10px]">explore</span>
            {direction}
          </span>
        ) : (
          <span className="text-[9px] font-black text-primary uppercase tracking-widest flex items-center gap-1">
            <span className="material-icons text-[10px]">warning</span>
            SAME STOP SELECTED
          </span>
        )}
      </div>

      {(voiceFeedback || voiceTranscript || voiceResult) && (
        <div className="px-5 mb-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-white/10 dark:bg-night-charcoal">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Voice Assistant</p>
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                  {voiceFeedback ?? 'Voice command ready.'}
                </p>
                <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {voiceStep === 'fare'
                    ? 'Route and fare'
                    : voiceStep === 'fare-type'
                      ? 'Regular or discounted'
                      : voiceStep === 'cash'
                        ? 'Passenger money'
                        : voiceStep === 'next-passenger'
                          ? 'Next passenger or exit'
                          : 'Confirm what I heard'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Confidence</p>
                <p className="mt-1 text-[11px] font-black text-slate-600 dark:text-slate-300">
                  {formatVoiceConfidence(voiceConfidence)}
                </p>
              </div>
            </div>

            {voiceTranscript && (
              <div className="mt-4 rounded-[1.5rem] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:bg-black/30 dark:text-slate-300">
                Heard: "{voiceTranscript}"
              </div>
            )}

            {voiceStep === 'confirm' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleVoiceConfirmationChoice(true)}
                  className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                  Yes, Use It
                </button>
                <button
                  onClick={() => handleVoiceConfirmationChoice(false)}
                  className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  No, Try Again
                </button>
              </div>
            )}

            {voiceStep === 'fare' && lastResolvedVoiceFareRef.current && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={handleUseSameRoute}
                  className="rounded-[1.5rem] bg-[#0f172a] py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                  Same Route
                </button>
                <button
                  onClick={() => startFareVoiceRecognition('fare')}
                  className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  New Route
                </button>
              </div>
            )}

            {voiceStep === 'cash' && lastVoiceCashAmountRef.current !== null && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={handleUseSameCashAmount}
                  className="rounded-[1.5rem] bg-[#0f172a] py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                  Same Amount
                </button>
                <button
                  onClick={() => startFareVoiceRecognition('cash')}
                  className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  Speak Money
                </button>
              </div>
            )}

            {voiceStep === 'next-passenger' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setVoiceStep('fare');
                    setVoiceResult(null);
                    setPendingVoiceFare(null);
                    setVoiceCashAmount(null);
                    setVoiceChangePreset(null);
                    const nextMessage = lastResolvedVoiceFareRef.current
                      ? 'Ready for the next passenger. Say same route, or say the new pickup and destination now.'
                      : 'Ready for the next passenger. Say the pickup and destination now.';
                    setVoiceFeedback(nextMessage);
                    queueVoicePrompt(nextMessage, 'fare');
                  }}
                  className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                  Next Passenger
                </button>
                <button
                  onClick={() => {
                    closeVoicePanelAfterReply('Voice assistant closed. Tap the mic anytime when you are ready again.');
                  }}
                  className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  Exit
                </button>
              </div>
            )}

            {voiceResult?.status === 'match' && (
              <div className="mt-4 grid gap-3">
                <div className="flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-black/30">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary">Parsed Route</p>
                    <p className="mt-2 text-base font-black text-slate-900 dark:text-white">
                      {voiceResult.originStop.name} to {voiceResult.destinationStop.name}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {voiceResult.distance.toFixed(1).replace(/\.0$/, '')} km / {voiceResult.fareType}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Answer</p>
                    <p className="mt-1 text-xl font-900 text-primary">
                      {voiceResult.fareType === 'either'
                        ? `${peso}${voiceResult.regularFare} / ${peso}${voiceResult.discountedFare}`
                        : `${peso}${voiceResult.fareType === 'discounted' ? voiceResult.discountedFare : voiceResult.regularFare}`}
                    </p>
                  </div>
                </div>
                {voiceCashAmount !== null && (
                  <div className="rounded-[1.5rem] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:bg-black/30 dark:text-slate-300">
                    Passenger Money: {peso}{voiceCashAmount}
                  </div>
                )}
                {voiceResult.fareType === 'either' ? (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => applyVoiceFareTypeChoice('regular')}
                      className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                    >
                      Regular
                    </button>
                    <button
                      onClick={() => applyVoiceFareTypeChoice('discounted')}
                      className="rounded-[1.5rem] bg-[#0f172a] py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                    >
                      Discounted
                    </button>
                    <button
                      onClick={() => startFareVoiceRecognition('fare-type')}
                      className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                    >
                      Ask Again
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={applyVoiceFare}
                      className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                    >
                      Ask For Money
                    </button>
                    <button
                      onClick={() => startFareVoiceRecognition('fare')}
                      className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                    >
                      Speak Again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-5 space-y-2 relative mb-6">
        <button
          onClick={() => {
            clearVisibleVoiceState();
            setIsOriginPickerOpen(true);
          }}
          className="w-full bg-white dark:bg-night-charcoal rounded-[2rem] p-8 border border-slate-100 dark:border-white/10 text-left flex items-start justify-between gap-4 shadow-sm active:bg-slate-50 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <HelpHint
              label="Tap here to pick an exact KM-post stop, or search a nearby place and let the app match it to the nearest route stop. If the place is between KM posts, Manual KM is safer."
              triggerClassName="inline-flex cursor-pointer rounded-md text-[9px] font-black uppercase tracking-widest text-primary"
            >
              Pickup Point
            </HelpHint>
            <h2 className="text-3xl font-800 text-slate-800 dark:text-white leading-tight whitespace-normal break-words">
              KM {formatKM(originStop.km)} - {origin}
            </h2>
          </div>
          <span className="material-icons text-slate-300 mt-2 shrink-0">chevron_right</span>
        </button>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <button
            onClick={handleSwap}
            className="w-14 h-14 bg-primary text-white rounded-2xl shadow-xl border-[6px] border-[#f8f6f6] dark:border-black active:scale-90 transition-transform flex items-center justify-center pointer-events-auto"
          >
            <span className="material-icons text-2xl">swap_vert</span>
          </button>
        </div>

        <button
          onClick={() => {
            clearVisibleVoiceState();
            setIsDestPickerOpen(true);
          }}
          className="w-full bg-white dark:bg-night-charcoal rounded-[2rem] p-8 border border-slate-100 dark:border-white/10 text-left flex items-start justify-between gap-4 shadow-sm active:bg-slate-50 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <HelpHint
              label="Tap here to choose the exact destination stop on the route. The fare is based on pickup point to destination."
              triggerClassName="inline-flex cursor-pointer rounded-md text-[9px] font-black uppercase tracking-widest text-primary"
            >
              Destination
            </HelpHint>
            <h2 className="text-3xl font-800 text-slate-800 dark:text-white leading-tight whitespace-normal break-words">
              KM {formatKM(destStop.km)} - {destination}
            </h2>
          </div>
          <span className="material-icons text-slate-300 mt-2 shrink-0">chevron_right</span>
        </button>
      </div>

      <div className="px-5 mb-6">
        <div className="bg-[#fbbf24] dark:bg-night-charcoal rounded-[2.5rem] p-8 shadow-2xl border-b-8 border-black/10 relative overflow-hidden">
          <div className="flex justify-between items-start mb-4 gap-4">
            <div>
              <p className="text-[10px] font-black text-slate-700 dark:text-slate-400 uppercase tracking-widest mb-1">Total Distance</p>
              <p className="text-6xl font-900 text-zinc-900 dark:text-white leading-none tracking-tighter">
                {formatKM(distance)} <span className="text-3xl font-800">km</span>
              </p>
            </div>
            {calculation.isMinApplied && distance > 0 && (
              <span className="bg-red-600 text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter shadow-md text-right">
                MINIMUM FARE APPLIED
              </span>
            )}
          </div>

          <div className="h-0.5 bg-black/10 dark:bg-white/10 w-full mb-6"></div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-black p-5 rounded-3xl shadow-sm text-center border border-white/20">
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase mb-2">Regular</p>
              <p className="text-5xl font-900 text-primary dark:text-vibrant-yellow leading-none tracking-tighter flex items-center justify-center">
                <span className="text-3xl mr-0.5 font-800">{peso}</span>{calculation.reg}
              </p>
            </div>
            <div className="bg-[#1a1a1a] dark:bg-white/5 p-5 rounded-3xl shadow-lg text-center border border-white/5">
              <p className="text-[10px] font-black text-[#fbbf24] uppercase mb-2">Discounted</p>
              <p className="text-5xl font-900 text-[#22c55e] leading-none tracking-tighter flex items-center justify-center">
                <span className="text-3xl mr-0.5 font-800">{peso}</span>{calculation.disc}
              </p>
            </div>
          </div>

          {distance > 0 && (
            <div className="mt-6 border-t border-black/5 dark:border-white/5 pt-4">
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-700 dark:text-slate-400 tracking-widest mb-2"
              >
                <span className="material-icons text-xs">{showBreakdown ? 'expand_less' : 'expand_more'}</span>
                {showBreakdown ? 'Hide Breakdown' : 'Show Breakdown'}
              </button>
              {showBreakdown && (
                <div className="space-y-1 animate-fade-in text-[10px] font-black text-slate-700/80 dark:text-slate-400/80">
                  <p>- {formatKM(distance)} km x {peso}{formatFareRate(activeRoute.fare.regularRate)} = {peso}{calculation.rawReg.toFixed(2)} (Reg)</p>
                  <p>- {formatKM(distance)} km x {peso}{formatFareRate(activeRoute.fare.discountRate)} = {peso}{calculation.rawDisc.toFixed(2)} (Disc)</p>
                  <p>- Final: Rounded to peso. {calculation.isMinApplied ? '(minimum fare applied)' : ''}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 mb-6">
        <div className="rounded-[2rem] border border-slate-200 bg-[#F5F6F7] px-5 py-5 shadow-sm dark:border-white/10 dark:bg-[#161a1d]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Fare Guide</h2>
          <div className="mt-4 space-y-4">
            {fareGuide.sections.map((section, index) => (
              <div
                key={section.title}
                className={index === 0 ? '' : 'border-t border-slate-200 pt-4 dark:border-white/10'}
              >
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{section.title}</p>
                <div className="mt-2 space-y-2">
                  {section.rows.map(row => (
                    <div key={`${section.title}-${row.label}`} className="flex items-center justify-between gap-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400">{row.label}</p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Note</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{fareGuide.note}</p>
          </div>
        </div>
      </div>

      {(lastRouteFare || routeRecentFares.length > 0) && (
        <div className="px-5 mb-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-white/10 dark:bg-night-charcoal">
            <div className="flex items-center justify-between gap-3">
              <div>
                <HelpHint
                  label="These are your latest fare combinations on this route. Tap one to load the same pickup and destination again."
              triggerClassName="inline-flex cursor-pointer rounded-md text-base font-semibold text-slate-900 dark:text-white"
                >
                  Recent Fares
                </HelpHint>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Reuse the latest route selections without tapping all the stops again.
                </p>
              </div>
              {lastRouteFare && (
                <button
                  onClick={() => applyRecentFare(lastRouteFare.origin, lastRouteFare.destination)}
                  className="rounded-2xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                  Repeat Last
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-3">
              {routeRecentFares.map(record => {
                const punchedFare =
                  record.punchedFareType === 'discounted' && record.discountedFare > 0
                    ? record.discountedFare
                    : record.regularFare;

                return (
                  <button
                    key={record.id}
                    onClick={() => applyRecentFare(record.origin, record.destination)}
                    className="flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-left active:scale-[0.99] dark:border-white/10 dark:bg-black/30"
                  >
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                        KM {formatKM(record.distance)} Saved Fare
                      </p>
                      <p className="mt-2 text-base font-black text-slate-900 dark:text-white">
                        {record.origin} to {record.destination}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-900 text-primary">{peso}{punchedFare}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Tap to Load
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="px-5 space-y-4 pb-8">
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handleSave}
            disabled={distance === 0}
            className="flex flex-col items-center justify-center gap-2 bg-white dark:bg-night-charcoal py-8 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 disabled:opacity-30 shadow-sm transition-all"
          >
            <span className="material-icons text-primary text-3xl">save</span>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">Save Log</span>
          </button>
          <button
            onClick={handleFavorite}
            disabled={distance === 0}
            className="flex flex-col items-center justify-center gap-2 bg-white dark:bg-night-charcoal py-8 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 disabled:opacity-30 shadow-sm transition-all"
          >
            <span className="material-icons text-primary text-3xl">star</span>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">Favorite</span>
          </button>
        </div>

        <button
          onClick={() => {
            setManualPrefill(null);
            setIsManualOpen(true);
          }}
          className="w-full bg-white dark:bg-night-charcoal py-6 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 shadow-sm transition-all flex items-center justify-center gap-4"
        >
          <span className="material-icons text-primary text-2xl">keyboard</span>
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-700 dark:text-slate-300">Manual Entry</span>
        </button>

        <button
          onClick={handleReset}
          className="w-full bg-white dark:bg-night-charcoal py-6 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 shadow-sm transition-all flex items-center justify-center gap-4"
        >
          <span className="material-icons text-primary text-2xl">refresh</span>
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-700 dark:text-slate-300">Reset Route</span>
        </button>
      </div>

      <FloatingVoiceButton
        active={isVoiceListening}
        disabled={!canUseVoiceRecognition}
        label="Voice Assistant"
        title={
          canUseVoiceRecognition
            ? 'Voice assistant'
            : 'Voice command is not available in this browser'
        }
        onActivate={() => startFareVoiceRecognition(voiceStep)}
      />

      <StopPickerOverlay
        isOpen={isOriginPickerOpen}
        onClose={() => setIsOriginPickerOpen(false)}
        onSelect={(name) => {
          clearVisibleVoiceState();
          setOrigin(name);
          setIsOriginPickerOpen(false);
        }}
        title="Pickup"
        mode="pickup"
        onRecommendManualKm={handleRecommendManualKmFromPlaceSearch}
      />
      <StopPickerOverlay
        isOpen={isDestPickerOpen}
        onClose={() => setIsDestPickerOpen(false)}
        onSelect={(name) => {
          clearVisibleVoiceState();
          setDestination(name);
          setIsDestPickerOpen(false);
        }}
        title="Destination"
        mode="destination"
      />
      <ManualKMOverlay
        isOpen={isManualOpen}
        onClose={() => {
          setIsManualOpen(false);
          setManualPrefill(null);
        }}
        initialPickupKm={manualPrefill?.pickupKm ?? null}
        initialDestKm={manualPrefill?.destKm ?? null}
      />
      <ConductorCalcOverlay
        isOpen={isConductorCalcOpen}
        onClose={() => {
          setIsConductorCalcOpen(false);
          setVoiceChangePreset(null);
        }}
        initialValue={calculation.reg}
        assistantPreset={voiceChangePreset}
      />
      <LocationAssistOverlay
        isOpen={isLocationAssistOpen}
        isLoading={isLocating}
        routeLabel={activeRoute.label}
        routeStartName={routeStart.name}
        routeEndName={routeEnd.name}
        routeStartKm={routeStart.km}
        routeEndKm={routeEnd.km}
        location={currentLocation}
        nearestMatch={nearestStopMatch}
        segmentMatch={nearestSegmentMatch}
        hasMappedStops={routeHasMappedStops}
        permissionState={locationPermission}
        inAppBrowser={inAppBrowser}
        error={locationError}
        warning={locationWarning}
        onClose={() => setIsLocationAssistOpen(false)}
        onOpenInChrome={handleOpenInChrome}
        onRetry={requestCurrentLocation}
        onUseStop={(stop) => handleUseDetectedStop(stop.name)}
        onUseManualKm={handleUseManualKmFromLocation}
        onOpenManualKm={handleOpenManualKmWithoutEstimate}
        onUseCurrentPoint={handleUseCurrentPoint}
        onOpenMapPicker={openLocationMapPicker}
      />
      <Suspense fallback={null}>
        <MapPickerOverlay
          isOpen={isMapPickerOpen}
          title="Map Point Picker"
          subtitle={activeRoute.label}
          initialPoint={
            currentLocation
              ? {
                  latitude: currentLocation.latitude,
                  longitude: currentLocation.longitude,
                  label: 'Current GPS',
                  source: 'gps'
                }
              : nearestStopMatch
                ? {
                    latitude: nearestStopMatch.stop.latitude ?? routeMapSeed.latitude,
                    longitude: nearestStopMatch.stop.longitude ?? routeMapSeed.longitude,
                    placeId: nearestStopMatch.stop.googlePlaceId ?? null,
                    label: nearestStopMatch.stop.name,
                    source: 'google-place'
                  }
                : routeMapSeed
          }
          confirmLabel="Use This Map Point"
          onClose={() => setIsMapPickerOpen(false)}
          onConfirm={point => {
            void handleConfirmMapPoint(point);
          }}
        />
      </Suspense>
    </div>
  );
};

export default CalcScreen;
