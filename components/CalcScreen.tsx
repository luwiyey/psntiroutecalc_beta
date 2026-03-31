import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import FloatingVoiceButton from './FloatingVoiceButton';
import HelpHint from './HelpHint';
import { calculateFare, formatFareRate } from '../utils/fare';
import { consumePendingMapsReturnRefresh } from '../utils/google-maps';
import type { MapPickerPoint } from './MapPickerOverlay';
import type { VoiceChangePreset } from './ConductorCalcOverlay';
import { useAuth } from '../context/AuthContext';
import type { Stop } from '../types';
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
import {
  analyzeSmartVoiceTranscript,
  type SmartVoiceAssistResult,
  type SmartVoiceConfidence
} from '../utils/smart-voice-assist';
import type {
  BrowserSpeechRecognition,
  FareConversationShortcut,
  FareTypeVoiceAnswer,
  FareVoiceParseResult
} from '../utils/voice';
import {
  cancelVoiceReply,
  extractRecognitionTranscript,
  findTopStopVoiceSuggestions,
  formatVoiceConfidence,
  getSpeechRecognitionCtor,
  getSpeechRecognitionErrorMessage,
  mergeSpeechTranscript,
  parseFareConversationShortcut,
  parseShiftVoiceCommand,
  parseVoiceBinaryAnswer,
  parseCashVoiceTranscript,
  parseFareTypeVoiceAnswer,
  parseFareVoiceTranscript,
  parsePassengerCountVoiceTranscript,
  parseStopVoiceTranscript,
  speakVoiceReply
} from '../utils/voice';
import { trackAnalyticsEvent } from '../utils/analytics';

const peso = '\u20B1';
const RECENT_FARE_LIMIT = 4;
type VoiceAssistantStep =
  | 'fare'
  | 'fare-type'
  | 'passenger-count'
  | 'cash'
  | 'done-check'
  | 'next-passenger'
  | 'confirm';
type MatchedFareVoiceResult = Extract<FareVoiceParseResult, { status: 'match' }>;
interface VoiceRouteClarificationContext {
  routePart: 'origin' | 'destination';
  otherStop: Stop;
  fareType: FareTypeVoiceAnswer | 'either';
  ambiguousLabel: string;
  candidateStops: Stop[];
}
type VoiceConfirmationAction =
  | {
      kind: 'fare-match';
      matchedFare: MatchedFareVoiceResult;
      retryStep: 'fare' | 'fare-type' | 'next-passenger';
    }
  | {
      kind: 'cash-amount';
      matchedFare: MatchedFareVoiceResult;
      cashAmount: number;
      retryStep: 'cash';
    }
  | {
      kind: 'clarified-stop';
      matchedFare: MatchedFareVoiceResult;
      clarificationContext: VoiceRouteClarificationContext;
      retryStep: 'fare' | 'next-passenger';
    };
const MapPickerOverlay = React.lazy(() => import('./MapPickerOverlay'));
const StopPickerOverlay = React.lazy(() => import('./StopPickerOverlay'));
const ManualKMOverlay = React.lazy(() => import('./ManualKMOverlay'));
const ConductorCalcOverlay = React.lazy(() => import('./ConductorCalcOverlay'));
const LocationAssistOverlay = React.lazy(() => import('./LocationAssistOverlay'));
const BetweenStopsScreen = React.lazy(() => import('./BetweenStopsScreen'));

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
    startShift,
    endShift,
    showToast
  } = useApp();
  const { authState } = useAuth();
  const [isOriginPickerOpen, setIsOriginPickerOpen] = useState(false);
  const [isDestPickerOpen, setIsDestPickerOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isConductorCalcOpen, setIsConductorCalcOpen] = useState(false);
  const [isLocationAssistOpen, setIsLocationAssistOpen] = useState(false);
  const [isMidStopOpen, setIsMidStopOpen] = useState(false);
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
  const [voicePassengerCount, setVoicePassengerCount] = useState<number | null>(null);
  const [voiceCashAmount, setVoiceCashAmount] = useState<number | null>(null);
  const [voiceChangePreset, setVoiceChangePreset] = useState<VoiceChangePreset | null>(null);
  const [voiceClarificationContext, setVoiceClarificationContext] =
    useState<VoiceRouteClarificationContext | null>(null);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const queuedVoicePromptRef = useRef<{ message: string; nextStep: VoiceAssistantStep | null } | null>(null);
  const queuedVoiceTimeoutRef = useRef<number | null>(null);
  const voiceSilenceTimeoutRef = useRef<number | null>(null);
  const voiceAutoRestartTimeoutRef = useRef<number | null>(null);
  const voiceAutoRestartCountRef = useRef(0);
  const committedVoiceTranscriptRef = useRef('');
  const latestVoiceTranscriptRef = useRef('');
  const latestVoiceConfidenceRef = useRef<number | null>(null);
  const voiceTranscriptHandledRef = useRef(false);
  const voiceResultRef = useRef<FareVoiceParseResult | null>(null);
  const pendingVoiceFareRef = useRef<MatchedFareVoiceResult | null>(null);
  const lastResolvedVoiceFareRef = useRef<MatchedFareVoiceResult | null>(null);
  const activeVoiceFareRef = useRef<MatchedFareVoiceResult | null>(null);
  const activeVoicePassengerCountRef = useRef<number | null>(null);
  const lastVoiceCashAmountRef = useRef<number | null>(null);
  const pendingVoiceConfirmationRef = useRef<VoiceConfirmationAction | null>(null);
  const pendingVoiceClarificationRef = useRef<VoiceRouteClarificationContext | null>(null);
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
    voiceResultRef.current = voiceResult;
  }, [voiceResult]);

  useEffect(() => {
    pendingVoiceFareRef.current = pendingVoiceFare;
  }, [pendingVoiceFare]);

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
    setVoicePassengerCount(null);
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
    committedVoiceTranscriptRef.current = '';
    latestVoiceConfidenceRef.current = null;
    voiceTranscriptHandledRef.current = false;
    voiceResultRef.current = null;
    pendingVoiceFareRef.current = null;
    lastResolvedVoiceFareRef.current = null;
    activeVoiceFareRef.current = null;
    activeVoicePassengerCountRef.current = null;
    lastVoiceCashAmountRef.current = null;
    pendingVoiceConfirmationRef.current = null;
    pendingVoiceClarificationRef.current = null;
    setVoiceClarificationContext(null);
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
    if (voiceAutoRestartTimeoutRef.current) {
      window.clearTimeout(voiceAutoRestartTimeoutRef.current);
      voiceAutoRestartTimeoutRef.current = null;
    }
    voiceAutoRestartCountRef.current = 0;
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
      committedVoiceTranscriptRef.current = '';
      latestVoiceConfidenceRef.current = null;
      voiceTranscriptHandledRef.current = false;
      activeVoiceFareRef.current = null;
      pendingVoiceConfirmationRef.current = null;
      pendingVoiceClarificationRef.current = null;
      setVoiceClarificationContext(null);
      voiceRecognitionRef.current?.abort();
      voiceRecognitionRef.current = null;
      if (voiceAutoRestartTimeoutRef.current) {
        window.clearTimeout(voiceAutoRestartTimeoutRef.current);
        voiceAutoRestartTimeoutRef.current = null;
      }
      voiceAutoRestartCountRef.current = 0;
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
    clearVisibleVoiceState({ keepMemory: false });
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
    clearVisibleVoiceState({ keepMemory: false });
    setOrigin(routeStart.name);
    setDestination(routeEnd.name);
    showToast(`Reset to ${activeRoute.shortLabel}`);
  };

  const applyRecentFare = (nextOrigin: string, nextDestination: string) => {
    clearVisibleVoiceState({ keepMemory: false });
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

  const clearVoiceAutoRestartTimeout = () => {
    if (voiceAutoRestartTimeoutRef.current) {
      window.clearTimeout(voiceAutoRestartTimeoutRef.current);
      voiceAutoRestartTimeoutRef.current = null;
    }
  };

  const setPendingVoiceClarification = (context: VoiceRouteClarificationContext | null) => {
    pendingVoiceClarificationRef.current = context;
    setVoiceClarificationContext(context);
  };

  const clearVisibleVoiceState = (options?: { keepMemory?: boolean }) => {
    const keepMemory = options?.keepMemory ?? true;

    clearQueuedVoicePrompt();
    clearVoiceSilenceTimeout();
    clearVoiceAutoRestartTimeout();
    cancelVoiceReply();
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
    latestVoiceTranscriptRef.current = '';
    committedVoiceTranscriptRef.current = '';
    latestVoiceConfidenceRef.current = null;
    voiceTranscriptHandledRef.current = false;
    pendingVoiceConfirmationRef.current = null;
    setPendingVoiceClarification(null);
    voiceAutoRestartCountRef.current = 0;
    setIsVoiceListening(false);
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceFeedback(null);
    setVoiceResult(null);
    setPendingVoiceFare(null);
    voiceResultRef.current = null;
    pendingVoiceFareRef.current = null;
    activeVoiceFareRef.current = null;
    activeVoicePassengerCountRef.current = null;
    setVoicePassengerCount(null);
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
    clearVoiceAutoRestartTimeout();
    cancelVoiceReply();
    setIsVoiceListening(false);
    setVoiceFeedback(message);
    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceResult(null);
    setPendingVoiceFare(null);
    voiceResultRef.current = null;
    pendingVoiceFareRef.current = null;
    activeVoiceFareRef.current = null;
    activeVoicePassengerCountRef.current = null;
    setVoicePassengerCount(null);
    setVoiceCashAmount(null);
    setVoiceChangePreset(null);
    setVoiceStep('fare');
    pendingVoiceConfirmationRef.current = null;
    setPendingVoiceClarification(null);
    voiceAutoRestartCountRef.current = 0;

    const hidePanel = () => {
      setVoiceFeedback(null);
      setVoiceTranscript('');
      setVoiceConfidence(null);
      setVoiceResult(null);
      setPendingVoiceFare(null);
      setVoicePassengerCount(null);
      setVoiceCashAmount(null);
      setVoiceChangePreset(null);
      setVoiceStep('fare');
      activeVoiceFareRef.current = null;
      activeVoicePassengerCountRef.current = null;
      setVoiceClarificationContext(null);
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
        return pendingVoiceClarificationRef.current
          ? 'Listening... say the city, municipality, province, or nearby KM-post landmark.'
          : lastResolvedVoiceFareRef.current
            ? 'Listening... say a fare like "Bayambang to Baguio discounted", or say same route.'
            : 'Listening... say a fare like "Bayambang to Baguio discounted".';
      case 'fare-type':
        return 'Listening... say regular or discounted.';
      case 'passenger-count':
        return 'Listening... say how many passengers, like one passenger or two passengers.';
      case 'cash':
        return lastVoiceCashAmountRef.current
          ? `Listening... say how much is their money, or say same amount for ${lastVoiceCashAmountRef.current} pesos.`
          : 'Listening... say how much is their money, like "one thousand pesos".';
      case 'done-check':
        return 'Listening... say yes if you are done, or say no if you want to compute fare again.';
      case 'next-passenger':
        return 'Listening... say same route, say the new pickup and destination, or say exit.';
      case 'confirm':
        return 'Listening... say yes to confirm or no to try again.';
    }
  };

  const getNoSpeechPrompt = (step: VoiceAssistantStep) => {
    switch (step) {
      case 'fare':
        return pendingVoiceClarificationRef.current
          ? `I am still here. Please say where ${pendingVoiceClarificationRef.current.ambiguousLabel} is near, like the city, municipality, province, or nearby KM-post landmark.`
          : 'I am still here. Please say the pickup and destination again, or say same route.';
      case 'fare-type':
        return 'I am still here. Please say regular or discounted. I will keep waiting for your answer.';
      case 'passenger-count':
        return 'I am still here. Please say how many passengers there are, like one passenger or two passengers.';
      case 'cash':
        return lastVoiceCashAmountRef.current
          ? `I am still here. Please say how much is their money, or say same amount for ${lastVoiceCashAmountRef.current} pesos.`
          : 'I am still here. Please say how much is their money, or say exit.';
      case 'done-check':
        return 'I am still here. Please say yes if you are done, or say no if you want another fare.';
      case 'next-passenger':
        return 'I am still here. Please say same route, say the new pickup and destination, or say exit.';
      case 'confirm':
        return 'I am still here. Please say yes to confirm or no to try again.';
    }
  };

  const getVoiceSilenceDelay = (step: VoiceAssistantStep, hasFinal: boolean) => {
    if (hasFinal) {
      switch (step) {
        case 'cash':
          return 420;
        case 'fare-type':
          return 360;
        case 'passenger-count':
          return 160;
        case 'done-check':
          return 320;
        case 'next-passenger':
          return 420;
        case 'confirm':
          return 320;
        case 'fare':
        default:
          return 420;
      }
    }

    switch (step) {
      case 'cash':
        return 2600;
      case 'done-check':
        return 2200;
      case 'next-passenger':
        return 2400;
      case 'fare-type':
        return 2200;
      case 'passenger-count':
        return 1400;
      case 'confirm':
        return 2000;
      case 'fare':
      default:
        return 2600;
    }
  };

  const buildMatchedFareFromStops = (
    nextOriginStop: Stop,
    nextDestinationStop: Stop,
    nextFareType: FareTypeVoiceAnswer | 'either'
  ): MatchedFareVoiceResult => {
    const nextDistance = Math.abs(nextDestinationStop.km - nextOriginStop.km);
    const nextCalculation = calculateFare(nextDistance, activeRoute.fare);

    return {
      status: 'match',
      transcript: `${nextOriginStop.name} to ${nextDestinationStop.name}`,
      normalized: `${nextOriginStop.name.toLowerCase()} to ${nextDestinationStop.name.toLowerCase()}`,
      fareType: nextFareType,
      originStop: nextOriginStop,
      destinationStop: nextDestinationStop,
      distance: nextDistance,
      regularFare: nextCalculation.reg,
      discountedFare: nextCalculation.disc
    };
  };

  const splitFareQueries = (value: string) => {
    const normalized = value
      .toLowerCase()
      .replace(/\bti\b/g, ' to ')
      .replace(/\s+/g, ' ')
      .trim();
    const connectorMatch = normalized.match(/\bto\b/);

    if (!connectorMatch?.index && connectorMatch?.index !== 0) {
      return null;
    }

    const originQuery = normalized
      .slice(0, connectorMatch.index)
      .replace(/\bfrom\b/g, ' ')
      .trim();
    const destinationQuery = normalized
      .slice(connectorMatch.index + connectorMatch[0].length)
      .trim();

    if (!originQuery || !destinationQuery) {
      return null;
    }

    return { originQuery, destinationQuery };
  };

  const buildSmartStopAliases = (stop: Stop) => {
    const aliases = new Set<string>();
    const seeds = [stop.name, ...(stop.aliases ?? [])];

    seeds.forEach(seed => {
      const trimmed = seed.trim();
      if (!trimmed) {
        return;
      }

      aliases.add(trimmed);
      aliases.add(trimmed.replace(/[()/,-]+/g, ' ').replace(/\s+/g, ' ').trim());

      trimmed
        .split(/[\/(),-]/g)
        .map(part => part.trim())
        .filter(part => part.length >= 3)
        .forEach(part => aliases.add(part));
    });

    return [...aliases].filter(Boolean).slice(0, 10);
  };

  const describeStopChoices = (choices: Stop[]) => choices.map(choice => choice.name).join(', ');

  const findStopsFromClarificationChoices = (choices: string[]) => {
    if (!choices.length) {
      return [] as Stop[];
    }

    const normalizedChoices = choices
      .map(choice => choice.trim().toLowerCase())
      .filter(Boolean);

    return activeRoute.stops.filter(stop => {
      const candidates = [stop.name, ...(stop.aliases ?? [])].map(candidate =>
        candidate.trim().toLowerCase()
      );
      return normalizedChoices.some(choice => candidates.includes(choice));
    });
  };

  const buildLandmarkClarificationMessage = (
    context: VoiceRouteClarificationContext,
    options?: { followUp?: boolean }
  ) => {
    const subject = context.ambiguousLabel || (context.routePart === 'origin' ? 'that pickup' : 'that destination');
    const baseMessage = options?.followUp
      ? `I still need to know which ${context.routePart} stop you mean for ${subject}. Please say the city, municipality, province, or a nearby KM-post landmark.`
      : `I heard ${subject} as the ${context.routePart}. Which city, municipality, province, or nearby KM-post landmark is it near?`;

    if (context.candidateStops.length > 0) {
      return `${baseMessage} Closest KM-post matches are ${describeStopChoices(context.candidateStops)}.`;
    }

    return baseMessage;
  };

  const buildRouteClarificationFromTranscript = (
    transcript: string,
    fallbackFareType: FareTypeVoiceAnswer | 'either' = 'either',
    preferredChoices: string[] = []
  ) => {
    const splitQueries = splitFareQueries(transcript);
    if (!splitQueries) {
      return null;
    }

    const originResult = parseStopVoiceTranscript(splitQueries.originQuery, activeRoute);
    const destinationResult = parseStopVoiceTranscript(splitQueries.destinationQuery, activeRoute);
    const detectedFareType = parseFareTypeVoiceAnswer(transcript) ?? fallbackFareType;

    const createContext = (
      routePart: 'origin' | 'destination',
      ambiguousLabel: string,
      otherStop: Stop,
      candidateStops: Stop[]
    ) => {
      const nextContext: VoiceRouteClarificationContext = {
        routePart,
        ambiguousLabel,
        otherStop,
        fareType: detectedFareType,
        candidateStops
      };

      return {
        context: nextContext,
        message: buildLandmarkClarificationMessage(nextContext)
      };
    };

    const preferredCandidateStops = findStopsFromClarificationChoices(preferredChoices);

    if (originResult.status === 'match' && destinationResult.status !== 'match') {
      const destinationCandidates =
        preferredCandidateStops.length > 0
          ? preferredCandidateStops
          : destinationResult.suggestions && destinationResult.suggestions.length > 0
          ? destinationResult.suggestions
          : findTopStopVoiceSuggestions(splitQueries.destinationQuery, activeRoute, 4);
      return createContext(
        'destination',
        splitQueries.destinationQuery,
        originResult.stop,
        destinationCandidates.filter(candidate => candidate.name !== originResult.stop.name)
      );
    }

    if (destinationResult.status === 'match' && originResult.status !== 'match') {
      const originCandidates =
        preferredCandidateStops.length > 0
          ? preferredCandidateStops
          : originResult.suggestions && originResult.suggestions.length > 0
          ? originResult.suggestions
          : findTopStopVoiceSuggestions(splitQueries.originQuery, activeRoute, 4);
      return createContext(
        'origin',
        splitQueries.originQuery,
        destinationResult.stop,
        originCandidates.filter(candidate => candidate.name !== destinationResult.stop.name)
      );
    }

    return null;
  };

  const resolvePendingRouteClarification = (replyTranscript: string) => {
    const clarification = pendingVoiceClarificationRef.current;
    if (!clarification) {
      return null;
    }

    const queryVariants = [
      replyTranscript,
      `${clarification.ambiguousLabel} ${replyTranscript}`.trim(),
      `${replyTranscript} ${clarification.ambiguousLabel}`.trim()
    ];

    const aggregatedCandidates: Stop[] = [];
    queryVariants.forEach(query => {
      findTopStopVoiceSuggestions(query, activeRoute, 6).forEach(candidate => {
        if (!aggregatedCandidates.some(existing => existing.name === candidate.name)) {
          aggregatedCandidates.push(candidate);
        }
      });
    });

    const allowedNames = new Set(clarification.candidateStops.map(stop => stop.name));
    const narrowedCandidates =
      allowedNames.size > 0
        ? aggregatedCandidates.filter(candidate => allowedNames.has(candidate.name))
        : aggregatedCandidates;

    const candidates = narrowedCandidates.length > 0 ? narrowedCandidates : aggregatedCandidates;

    if (candidates.length === 0) {
      return {
        status: 'retry' as const,
        context: clarification,
        message: buildLandmarkClarificationMessage(clarification, { followUp: true })
      };
    }

    if (candidates.length > 1) {
      const nextContext: VoiceRouteClarificationContext = {
        ...clarification,
        candidateStops: candidates.slice(0, 4)
      };
      return {
        status: 'retry' as const,
        context: nextContext,
        message: buildLandmarkClarificationMessage(nextContext, { followUp: true })
      };
    }

    const resolvedStop = candidates[0];
    const matchedFare =
      clarification.routePart === 'origin'
        ? buildMatchedFareFromStops(resolvedStop, clarification.otherStop, clarification.fareType)
        : buildMatchedFareFromStops(clarification.otherStop, resolvedStop, clarification.fareType);

    return {
      status: 'resolved' as const,
      matchedFare
    };
  };

  const buildMatchedFareFromClarificationStop = (
    context: VoiceRouteClarificationContext,
    resolvedStop: Stop
  ) =>
    context.routePart === 'origin'
      ? buildMatchedFareFromStops(resolvedStop, context.otherStop, context.fareType)
      : buildMatchedFareFromStops(context.otherStop, resolvedStop, context.fareType);

  const beginRouteClarification = (
    context: VoiceRouteClarificationContext,
    step: 'fare' | 'next-passenger'
  ) => {
    if (context.candidateStops.length === 1) {
      const candidate = context.candidateStops[0];
      const matchedFare = buildMatchedFareFromClarificationStop(context, candidate);
      setPendingVoiceClarification(context);
      queueVoiceConfirmation(
        `Are you trying to say ${candidate.name} as the ${context.routePart}? Say yes or no.`,
        {
          kind: 'clarified-stop',
          matchedFare,
          clarificationContext: context,
          retryStep: step
        }
      );
      return;
    }

    setPendingVoiceClarification(context);
    const nextMessage = buildLandmarkClarificationMessage(context);
    setVoiceFeedback(nextMessage);
    queueVoicePrompt(nextMessage, step);
  };

  const handleClarificationStopChoice = (stop: Stop) => {
    const clarification = pendingVoiceClarificationRef.current;
    if (!clarification) {
      return;
    }

    setPendingVoiceClarification(null);
    handleMatchedFare(buildMatchedFareFromClarificationStop(clarification, stop), 'immediate');
  };

  const parseFareStepBinaryAnswer = (
    step: Extract<VoiceAssistantStep, 'confirm' | 'done-check' | 'next-passenger'>,
    transcript: string
  ): 'yes' | 'no' | null => {
    const normalized = transcript
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return null;
    }

    const matches = (pattern: RegExp) => pattern.test(normalized);

    if (step === 'done-check') {
      if (
        matches(
          /\b(yes|yeah|yea|yep|yup|yas|yess|yis|oo|opo|sige|okay|ok|sure|confirm|correct|tama|yes done|im done|i m done|done|done na|tapos|tapos na|finished|all done|yes im done|yes i m done)\b/
        )
      ) {
        return 'yes';
      }

      if (
        matches(
          /\b(no|nope|not yet|hindi|hindi pa|another|again|one more|next passenger|compute again|huwag muna|wag muna)\b/
        )
      ) {
        return 'no';
      }

      return null;
    }

    if (step === 'next-passenger') {
      if (
        matches(
          /\b(yes|yeah|yea|yep|yup|yas|yess|yis|oo|opo|continue|another|again|more|next passenger|go on|sunod|susunod|sige|sure|confirm|proceed)\b/
        )
      ) {
        return 'yes';
      }

      if (
        matches(
          /\b(no|nope|exit|stop|close|cancel|end|done|finished|tapos|tapos na|labas|tama na|ayaw)\b/
        )
      ) {
        return 'no';
      }

      return null;
    }

    if (
      matches(
        /\b(yes|yeah|yea|yep|yup|yas|yess|yis|oo|opo|correct|tama|right|affirmative|that s right|thats right|sure|confirm|confirmed|go ahead|proceed|okay|ok)\b/
      )
    ) {
      return 'yes';
    }

    if (matches(/\b(no|nope|wrong|mali|not that|hindi|hindi iyon|hindi yun)\b/)) {
      return 'no';
    }

    return null;
  };

  const queueVoicePrompt = (message: string, nextStep: VoiceAssistantStep | null) => {
    clearQueuedVoicePrompt();
    queuedVoicePromptRef.current = { message, nextStep };
  };

  const shouldConfirmVoiceInterpretation = (
    confidence: number | null,
    smartConfidence: SmartVoiceConfidence | null = null
  ) => {
    if (smartConfidence === 'high') {
      return false;
    }

    if (smartConfidence === 'medium') {
      return typeof confidence === 'number' && !Number.isNaN(confidence) && confidence < 0.35;
    }

    return typeof confidence === 'number' && !Number.isNaN(confidence) && confidence < 0.45;
  };

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

  const setActiveVoicePassengerCount = (nextPassengerCount: number | null) => {
    activeVoicePassengerCountRef.current = nextPassengerCount;
    setVoicePassengerCount(nextPassengerCount);
  };

  const getResolvedFareTotal = (
    matchedFare: MatchedFareVoiceResult,
    passengerCount = Math.max(activeVoicePassengerCountRef.current ?? 1, 1)
  ) => Number((getResolvedFareAmount(matchedFare) * passengerCount).toFixed(2));

  const getResolvedFareLabel = (matchedFare: MatchedFareVoiceResult) =>
    matchedFare.fareType === 'discounted' ? 'Discounted' : 'Regular';

  const resolveVoiceFareType = (
    matchedFare: MatchedFareVoiceResult,
    nextFareType: FareTypeVoiceAnswer
  ): MatchedFareVoiceResult => ({
    ...matchedFare,
    fareType: nextFareType
  });

  const buildMatchedFareFromSmartVoice = (
    smartResult: SmartVoiceAssistResult | null
  ): MatchedFareVoiceResult | null => {
    if (!smartResult?.originStopName || !smartResult.destinationStopName) {
      return null;
    }

    const findStopByName = (stopName: string) =>
      activeRoute.stops.find(stop => stop.name.toLowerCase() === stopName.trim().toLowerCase()) ?? null;

    const nextOriginStop = findStopByName(smartResult.originStopName);
    const nextDestStop = findStopByName(smartResult.destinationStopName);

    if (!nextOriginStop || !nextDestStop || nextOriginStop.name === nextDestStop.name) {
      return null;
    }

    const nextFareType =
      smartResult.fareType === 'regular' || smartResult.fareType === 'discounted'
        ? smartResult.fareType
        : 'either';

    return buildMatchedFareFromStops(nextOriginStop, nextDestStop, nextFareType);
  };

  const buildScreenFareContext = (
    fareType: 'regular' | 'discounted' | 'either'
  ): MatchedFareVoiceResult | null => {
    if (originStop.name === destStop.name || distance <= 0) {
      return null;
    }

    return {
      status: 'match',
      transcript: `${originStop.name} to ${destStop.name}`,
      normalized: `${originStop.name.toLowerCase()} to ${destStop.name.toLowerCase()}`,
      fareType,
      originStop,
      destinationStop: destStop,
      distance,
      regularFare: calculation.reg,
      discountedFare: calculation.disc
    };
  };

  const getActiveVoiceFareContext = (
    mode: 'fare-type' | 'cash' | 'resolved'
  ): MatchedFareVoiceResult | null => {
    const candidates = [
      activeVoiceFareRef.current,
      pendingVoiceFareRef.current,
      voiceResultRef.current?.status === 'match' ? voiceResultRef.current : null,
      lastResolvedVoiceFareRef.current
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if ((mode === 'cash' || mode === 'resolved') && candidate.fareType === 'either') {
        continue;
      }
      return candidate;
    }

    if (mode === 'fare-type') {
      return buildScreenFareContext('either');
    }

    return null;
  };

  const applyVoiceShortcut = (
    shortcut: FareConversationShortcut,
    confidence: number | null,
    currentStep: VoiceAssistantStep,
    smartConfidence: SmartVoiceConfidence | null = null
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

      if (currentStep === 'fare' || shouldConfirmVoiceInterpretation(confidence, smartConfidence)) {
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
      const fareContext = getActiveVoiceFareContext('cash');
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
      setPendingVoiceClarification(null);
      handleMatchedFare(action.matchedFare, 'queued');
      return;
    }

    if (action.kind === 'clarified-stop') {
      setPendingVoiceClarification(null);
      handleMatchedFare(action.matchedFare, 'queued');
      return;
    }

    finishVoiceChangeFlow(action.matchedFare, action.cashAmount);
  };

  const speakPromptAndListen = (message: string, nextStep: VoiceAssistantStep) => {
    setVoiceFeedback(message);
    setVoiceStep(nextStep);
    clearQueuedVoicePrompt();
    clearVoiceAutoRestartTimeout();
    voiceAutoRestartCountRef.current = 0;

    const beginListening = () => {
      queuedVoiceTimeoutRef.current = null;
      window.setTimeout(() => startFareVoiceRecognition(nextStep), 20);
    };

    cancelVoiceReply();
    const started = speakVoiceReply(message, {
      onEnd: beginListening,
      onError: beginListening
    });

    if (!started) {
      queuedVoiceTimeoutRef.current = window.setTimeout(beginListening, 40);
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

  const beginPassengerCountFollowUp = (
    matchedFare: MatchedFareVoiceResult,
    mode: 'queued' | 'immediate' = 'queued'
  ) => {
    pendingVoiceConfirmationRef.current = null;
    applyVoiceRouteSelection(matchedFare);
    lastResolvedVoiceFareRef.current = matchedFare;
    activeVoiceFareRef.current = matchedFare;
    setVoiceResult(matchedFare);
    setPendingVoiceFare(matchedFare);
    voiceResultRef.current = matchedFare;
    pendingVoiceFareRef.current = matchedFare;
    setActiveVoicePassengerCount(null);
    setVoiceCashAmount(null);
    setVoiceChangePreset(null);
    setVoiceStep('passenger-count');

    const fareAmount = getResolvedFareAmount(matchedFare);
    const nextMessage = `${getResolvedFareLabel(matchedFare)} fare from ${matchedFare.originStop.name} to ${matchedFare.destinationStop.name} is ${fareAmount} pesos each. How many passengers?`;

    if (mode === 'queued') {
      setVoiceFeedback(nextMessage);
      queueVoicePrompt(nextMessage, 'passenger-count');
      return;
    }

    speakPromptAndListen(nextMessage, 'passenger-count');
  };

  const beginCashFollowUp = (
    matchedFare: MatchedFareVoiceResult,
    passengerCount: number,
    mode: 'queued' | 'immediate' = 'queued'
  ) => {
    pendingVoiceConfirmationRef.current = null;
    applyVoiceRouteSelection(matchedFare);
    lastResolvedVoiceFareRef.current = matchedFare;
    activeVoiceFareRef.current = matchedFare;
    setVoiceResult(matchedFare);
    setPendingVoiceFare(matchedFare);
    voiceResultRef.current = matchedFare;
    pendingVoiceFareRef.current = matchedFare;
    setActiveVoicePassengerCount(passengerCount);
    setVoiceCashAmount(null);
    setVoiceChangePreset(null);
    setVoiceStep('cash');

    const fareAmount = getResolvedFareAmount(matchedFare);
    const totalFareAmount = getResolvedFareTotal(matchedFare, passengerCount);
    const sameCashHint = lastVoiceCashAmountRef.current ? ' You can also say same amount.' : '';
    const passengerLabel = passengerCount === 1 ? 'passenger' : 'passengers';
    const nextMessage = `${getResolvedFareLabel(matchedFare)} fare from ${matchedFare.originStop.name} to ${matchedFare.destinationStop.name} is ${fareAmount} pesos each. For ${passengerCount} ${passengerLabel}, total fare is ${totalFareAmount} pesos. How much is their money?${sameCashHint}`;

    if (mode === 'queued') {
      setVoiceFeedback(nextMessage);
      queueVoicePrompt(nextMessage, 'cash');
      return;
    }

    speakPromptAndListen(nextMessage, 'cash');
  };

  const beginNextPassengerFollowUp = (
    matchedFare: MatchedFareVoiceResult,
    passengerCount: number,
    cashAmount: number,
    changeAmount: number,
    summary: string
  ) => {
    pendingVoiceConfirmationRef.current = null;
    const nextMessage = `${summary} Are you done using the calculator? Say yes if you are done, or say no if you want to compute fare again for the next passenger.`;
    setVoiceResult(matchedFare);
    setPendingVoiceFare(null);
    voiceResultRef.current = matchedFare;
    pendingVoiceFareRef.current = null;
    activeVoiceFareRef.current = matchedFare;
    setActiveVoicePassengerCount(passengerCount);
    setVoiceCashAmount(cashAmount);
    setVoiceStep('done-check');
    setVoiceFeedback(nextMessage);
    queueVoicePrompt(nextMessage, 'done-check');
  };

  const finishVoiceChangeFlow = (
    matchedFare: MatchedFareVoiceResult,
    cashAmount: number,
    passengerCount = Math.max(activeVoicePassengerCountRef.current ?? 1, 1)
  ) => {
    pendingVoiceConfirmationRef.current = null;
    setPendingVoiceClarification(null);
    applyVoiceRouteSelection(matchedFare);
    lastResolvedVoiceFareRef.current = matchedFare;
    lastVoiceCashAmountRef.current = cashAmount;
    setVoiceResult(matchedFare);
    setPendingVoiceFare(null);
    voiceResultRef.current = matchedFare;
    pendingVoiceFareRef.current = null;
    setActiveVoicePassengerCount(passengerCount);
    setVoiceCashAmount(cashAmount);

    const fareAmount = getResolvedFareTotal(matchedFare, passengerCount);
    const changeAmount = Number((cashAmount - fareAmount).toFixed(2));
    const passengerLabel = passengerCount === 1 ? 'passenger' : 'passengers';
    const summary =
      changeAmount >= 0
        ? `${getResolvedFareLabel(matchedFare)} fare for ${passengerCount} ${passengerLabel} is ${fareAmount} pesos. Passenger money is ${cashAmount} pesos. Change is ${changeAmount} pesos.`
        : `${getResolvedFareLabel(matchedFare)} fare for ${passengerCount} ${passengerLabel} is ${fareAmount} pesos. Passenger money is ${cashAmount} pesos. Still lacking ${Math.abs(changeAmount)} pesos.`;

    setVoiceFeedback(summary);
    setVoiceChangePreset({
      fareAmount,
      cashAmount,
      changeAmount,
      summary
    });
    setIsConductorCalcOpen(true);
    beginNextPassengerFollowUp(matchedFare, passengerCount, cashAmount, changeAmount, summary);
    showToast('Voice change result ready.', 'success');
  };

  const handleMatchedFare = (matchedFare: MatchedFareVoiceResult, mode: 'queued' | 'immediate' = 'queued') => {
    setPendingVoiceClarification(null);
    if (matchedFare.fareType === 'either') {
      applyVoiceRouteSelection(matchedFare);
      activeVoiceFareRef.current = matchedFare;
      setVoiceResult(matchedFare);
      setPendingVoiceFare(matchedFare);
      voiceResultRef.current = matchedFare;
      pendingVoiceFareRef.current = matchedFare;
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

    beginPassengerCountFollowUp(matchedFare, mode);
    showToast('Voice fare heard. Asking for passenger count.', 'success');
  };

  const applyVoiceFare = () => {
    if (!voiceResult || voiceResult.status !== 'match') return;

    if (voiceResult.fareType === 'either') {
      handleMatchedFare(voiceResult, 'immediate');
      return;
    }

    beginPassengerCountFollowUp(voiceResult, 'immediate');
  };

  const applyVoiceFareTypeChoice = (nextFareType: FareTypeVoiceAnswer) => {
    const baseFare = getActiveVoiceFareContext('fare-type');

    if (!baseFare) {
      const nextMessage = `Please say the route first, like ${routeStart.name} to ${routeEnd.name}.`;
      setVoiceFeedback(nextMessage);
      speakPromptAndListen(nextMessage, 'fare');
      return;
    }

    beginPassengerCountFollowUp(resolveVoiceFareType(baseFare, nextFareType), 'immediate');
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
    if (pendingConfirmation.kind === 'clarified-stop') {
      const retryMessage = buildLandmarkClarificationMessage(pendingConfirmation.clarificationContext, {
        followUp: true
      });
      setPendingVoiceClarification(pendingConfirmation.clarificationContext);
      setVoiceStep(pendingConfirmation.retryStep);
      setVoiceFeedback(retryMessage);
      queueVoicePrompt(retryMessage, pendingConfirmation.retryStep);
      return;
    }

    setVoiceStep(pendingConfirmation.retryStep);
    const retryMessage =
      pendingConfirmation.retryStep === 'cash'
        ? 'Okay. Please say how much is their money again.'
        : pendingConfirmation.retryStep === 'fare-type'
          ? 'Okay. Please say regular or discounted again.'
          : pendingConfirmation.retryStep === 'next-passenger'
            ? 'Okay. Please say same route, say the new pickup and destination, or say exit.'
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
    const fareContext = getActiveVoiceFareContext('cash');
    const lastCashAmount = lastVoiceCashAmountRef.current;

    if (!fareContext || !lastCashAmount) {
      showToast('No previous passenger money remembered yet.', 'info');
      return;
    }

    finishVoiceChangeFlow(fareContext, lastCashAmount);
  };

  const processFareVoiceTranscript = async (
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

    let smartAnalysisPromise:
        | Promise<{
          smartResult: SmartVoiceAssistResult | null;
          effectiveTranscript: string;
          smartConfidence: SmartVoiceConfidence | null;
          smartFareType: FareTypeVoiceAnswer | null;
          smartPassengerCount: number | null;
          smartBinaryAnswer: 'yes' | 'no' | null;
          smartCashAmount: number | null;
          smartShortcut: FareConversationShortcut | null;
          smartMatchedFare: MatchedFareVoiceResult | null;
          smartClarificationMessage: string | null;
        } | null>
      | null = null;

    const getSmartAnalysis = async () => {
      if (smartAnalysisPromise) {
        return smartAnalysisPromise;
      }

      smartAnalysisPromise = (async () => {
        const smartResult = await analyzeSmartVoiceTranscript({
          step: requestedStep,
          transcript: trimmedTranscript,
          routeLabel: activeRoute.label,
          routeStops: activeRoute.stops.map(stop => ({
            name: stop.name,
            km: stop.km,
            aliases: buildSmartStopAliases(stop)
          })),
          activeFare: (() => {
            const activeFare = getActiveVoiceFareContext('fare-type');
            if (!activeFare) return null;
            return {
              originStopName: activeFare.originStop.name,
              destinationStopName: activeFare.destinationStop.name,
              fareType: activeFare.fareType
            };
          })(),
          lastResolvedFare: lastResolvedVoiceFareRef.current
            ? {
                originStopName: lastResolvedVoiceFareRef.current.originStop.name,
                destinationStopName: lastResolvedVoiceFareRef.current.destinationStop.name,
                fareType: lastResolvedVoiceFareRef.current.fareType
              }
            : null,
          lastCashAmount: lastVoiceCashAmountRef.current
        });

        if (!smartResult) {
          return null;
        }

        const effectiveTranscript = smartResult.correctedTranscript?.trim() || trimmedTranscript;
        const smartFareType =
          smartResult.fareType === 'regular' || smartResult.fareType === 'discounted'
            ? smartResult.fareType
            : null;

        const smartShortcut: FareConversationShortcut | null =
          smartResult.shortcut !== 'none'
            ? smartResult.shortcut === 'same-route'
              ? {
                  command: 'same-route',
                  fareType: smartFareType
                }
              : smartResult.shortcut === 'same-cash'
                ? { command: 'same-cash' }
                : { command: 'new-route' }
            : null;

        return {
          smartResult,
          effectiveTranscript,
          smartConfidence: smartResult.confidence ?? null,
          smartFareType,
          smartPassengerCount:
            typeof smartResult.passengerCount === 'number' && Number.isFinite(smartResult.passengerCount)
              ? Math.max(1, Math.round(smartResult.passengerCount))
              : null,
          smartBinaryAnswer:
            smartResult.binaryAnswer !== 'unknown' ? smartResult.binaryAnswer : null,
          smartCashAmount:
            typeof smartResult.cashAmount === 'number' && Number.isFinite(smartResult.cashAmount)
              ? smartResult.cashAmount
              : null,
          smartShortcut,
          smartMatchedFare: buildMatchedFareFromSmartVoice(smartResult),
          smartClarificationMessage: smartResult.clarificationQuestion
            ? [
                smartResult.clarificationQuestion,
                smartResult.clarificationChoices.length > 0
                  ? `Choices: ${smartResult.clarificationChoices.join(', ')}.`
                  : ''
              ]
                .filter(Boolean)
                .join(' ')
            : null
        };
      })();

      return smartAnalysisPromise;
    };

    const shiftCommand = parseShiftVoiceCommand(trimmedTranscript);
    if (shiftCommand.status === 'match') {
      if (shiftCommand.command === 'start-shift') {
        const startedShift = startShift('manual');
        const message = startedShift
          ? `Shift started at ${new Date(startedShift.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. You can keep computing fares now.`
          : 'Shift is already open. You can keep computing fares now.';
        setVoiceFeedback(message);
        queueVoicePrompt(message, requestedStep === 'confirm' ? 'fare' : requestedStep);
      } else {
        const closedShift = endShift();
        const message = closedShift
          ? `Shift ended at ${new Date(closedShift.endedAt ?? Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. You can still compute fares now.`
          : 'No open shift to end right now. You can still compute fares now.';
        setVoiceFeedback(message);
        queueVoicePrompt(message, requestedStep === 'confirm' ? 'fare' : requestedStep);
      }
      return;
    }

    if (/\b(cancel|stop|close|exit|end|quit|nevermind|never mind|shut up|be quiet|quiet|silence|tahimik|tumahimik)\b/i.test(trimmedTranscript)) {
      pendingVoiceConfirmationRef.current = null;
      closeVoicePanelAfterReply('Voice assistant cancelled.');
      return;
    }

    if (/\b(are you still there|still there|nandiyan ka pa|naririnig mo ako|hello)\b/i.test(trimmedTranscript)) {
      const stillHereMessage =
        requestedStep === 'cash'
          ? 'Yes, I am still here. Please say how much is their money, or say same amount.'
          : requestedStep === 'passenger-count'
            ? 'Yes, I am still here. Please say how many passengers there are.'
          : requestedStep === 'done-check'
            ? 'Yes, I am still here. Say yes if you are done, or say no if you want another fare.'
          : requestedStep === 'next-passenger'
            ? 'Yes, I am still here. Please say same route, say the new pickup and destination, or say exit.'
            : getListeningPrompt(requestedStep);
      setVoiceFeedback(stillHereMessage);
      queueVoicePrompt(stillHereMessage, requestedStep);
      return;
    }

    if (/\b(sorry|wrong|mali|not that|hindi iyon|hindi yun|ulitin)\b/i.test(trimmedTranscript)) {
      const correctionMessage =
        requestedStep === 'cash'
          ? 'Okay. Please say how much is their money again.'
          : requestedStep === 'passenger-count'
            ? 'Okay. Please say how many passengers there are again.'
          : requestedStep === 'fare-type'
            ? 'Okay. Please say regular or discounted again.'
            : requestedStep === 'done-check'
              ? 'Okay. Say yes if you are done, or say no if you want another fare.'
              : requestedStep === 'next-passenger'
                ? 'Okay. Say same route, say the new pickup and destination, or say exit.'
                : 'Okay. Please say the pickup and destination again.';
      setVoiceFeedback(correctionMessage);
      queueVoicePrompt(correctionMessage, requestedStep);
      return;
    }

    if (
      pendingVoiceClarificationRef.current &&
      (requestedStep === 'fare' || requestedStep === 'next-passenger') &&
      !/\b(?:to|ti)\b/i.test(trimmedTranscript)
    ) {
      const clarificationResult = resolvePendingRouteClarification(trimmedTranscript);
      if (clarificationResult?.status === 'resolved') {
        setPendingVoiceClarification(null);
        handleMatchedFare(clarificationResult.matchedFare, 'queued');
        return;
      }

      if (clarificationResult?.status === 'retry') {
        setPendingVoiceClarification(clarificationResult.context);
        setVoiceFeedback(clarificationResult.message);
        queueVoicePrompt(clarificationResult.message, requestedStep);
        return;
      }
    }

    if (requestedStep === 'confirm') {
      const localAnswer = parseFareStepBinaryAnswer('confirm', trimmedTranscript);
      const smartAnalysis = localAnswer ? null : await getSmartAnalysis();
      const effectiveTranscript = smartAnalysis?.effectiveTranscript ?? trimmedTranscript;
      const confirmationAnswer =
        localAnswer ??
        smartAnalysis?.smartBinaryAnswer ??
        parseFareStepBinaryAnswer('confirm', effectiveTranscript) ??
        parseVoiceBinaryAnswer(effectiveTranscript);
      const pendingConfirmation = pendingVoiceConfirmationRef.current;

      setVoiceTranscript(effectiveTranscript);

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
      if (pendingConfirmation.kind === 'clarified-stop') {
        const retryMessage = buildLandmarkClarificationMessage(
          pendingConfirmation.clarificationContext,
          { followUp: true }
        );
        setPendingVoiceClarification(pendingConfirmation.clarificationContext);
        setVoiceStep(pendingConfirmation.retryStep);
        setVoiceFeedback(retryMessage);
        queueVoicePrompt(retryMessage, pendingConfirmation.retryStep);
        return;
      }

      setVoiceStep(pendingConfirmation.retryStep);
      const retryMessage =
        pendingConfirmation.retryStep === 'cash'
          ? 'Okay. Please say how much is their money again.'
          : pendingConfirmation.retryStep === 'fare-type'
            ? 'Okay. Please say regular or discounted again.'
            : pendingConfirmation.retryStep === 'next-passenger'
              ? 'Okay. Please say same route, say the new pickup and destination, or say exit.'
            : 'Okay. Please say the route again.';
      setVoiceFeedback(retryMessage);
      queueVoicePrompt(retryMessage, pendingConfirmation.retryStep);
      return;
    }

    if (requestedStep === 'fare') {
      const localShortcut = parseFareConversationShortcut(trimmedTranscript);
      if (localShortcut && applyVoiceShortcut(localShortcut, confidence, requestedStep)) {
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

      const localClarification = buildRouteClarificationFromTranscript(trimmedTranscript);
      if (localClarification) {
        setPendingVoiceFare(null);
        setVoiceCashAmount(null);
        beginRouteClarification(localClarification.context, 'fare');
        return;
      }

      const smartAnalysis = await getSmartAnalysis();
      const effectiveTranscript = smartAnalysis?.effectiveTranscript ?? trimmedTranscript;
      const smartShortcut = smartAnalysis?.smartShortcut ?? null;
      const smartFareType = smartAnalysis?.smartFareType ?? null;
      const smartMatchedFare = smartAnalysis?.smartMatchedFare ?? null;
      const smartClarificationMessage = smartAnalysis?.smartClarificationMessage ?? null;
      const smartClarificationChoices = smartAnalysis?.smartResult?.clarificationChoices ?? [];
      const smartConfidence = smartAnalysis?.smartConfidence ?? null;

      setVoiceTranscript(effectiveTranscript);

      if (smartShortcut && applyVoiceShortcut(smartShortcut, confidence, requestedStep, smartConfidence)) {
        return;
      }

      if (smartMatchedFare) {
        setVoiceResult(smartMatchedFare);
        if (shouldConfirmVoiceInterpretation(confidence, smartConfidence)) {
          const confirmMessage =
            smartMatchedFare.fareType === 'either'
              ? `I heard ${smartMatchedFare.originStop.name} to ${smartMatchedFare.destinationStop.name}. Say yes to continue or no to try again.`
              : `I heard ${getResolvedFareLabel(smartMatchedFare).toLowerCase()} fare from ${smartMatchedFare.originStop.name} to ${smartMatchedFare.destinationStop.name}. Say yes or no.`;
          queueVoiceConfirmation(confirmMessage, {
            kind: 'fare-match',
            matchedFare: smartMatchedFare,
            retryStep: 'fare'
          });
          return;
        }

        handleMatchedFare(smartMatchedFare, 'queued');
        return;
      }

      const smartClarification = buildRouteClarificationFromTranscript(
        effectiveTranscript,
        smartFareType ?? 'either',
        smartClarificationChoices
      );
      if (smartClarification) {
        setPendingVoiceFare(null);
        setVoiceCashAmount(null);
        beginRouteClarification(smartClarification.context, 'fare');
        return;
      }

      if (smartClarificationMessage) {
        setPendingVoiceClarification(null);
        setPendingVoiceFare(null);
        setVoiceCashAmount(null);
        setVoiceFeedback(smartClarificationMessage);
        queueVoicePrompt(smartClarificationMessage, 'fare');
        return;
      }

      setPendingVoiceClarification(null);
      setPendingVoiceFare(null);
      setVoiceCashAmount(null);
      setVoiceFeedback(parsed.message);
      queueVoicePrompt(parsed.message, 'fare');
      return;
    }

    if (requestedStep === 'fare-type') {
      const baseFare = getActiveVoiceFareContext('fare-type');
      const localFareType = parseFareTypeVoiceAnswer(trimmedTranscript);

      if (!baseFare) {
        const nextMessage = `Please say the route first, like ${routeStart.name} to ${routeEnd.name}.`;
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'fare');
        return;
      }

      const smartAnalysis = localFareType ? null : await getSmartAnalysis();
      const effectiveTranscript = smartAnalysis?.effectiveTranscript ?? trimmedTranscript;
      const parsedFareType =
        localFareType ??
        smartAnalysis?.smartFareType ??
        parseFareTypeVoiceAnswer(effectiveTranscript);
      const smartConfidence = smartAnalysis?.smartConfidence ?? null;

      setVoiceTranscript(effectiveTranscript);

      if (!parsedFareType) {
        const nextMessage = 'Please say regular or discounted fare.';
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'fare-type');
        return;
      }

      const resolvedFare = resolveVoiceFareType(baseFare, parsedFareType);
      if (shouldConfirmVoiceInterpretation(confidence, smartConfidence)) {
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

      beginPassengerCountFollowUp(resolvedFare, 'queued');
      return;
    }

    if (requestedStep === 'passenger-count') {
      const fareContext = getActiveVoiceFareContext('resolved');

      if (!fareContext) {
        const unresolvedFare = getActiveVoiceFareContext('fare-type');
        if (unresolvedFare) {
          const nextMessage = 'I still need to know if this fare is regular or discounted. Please say regular or discounted.';
          activeVoiceFareRef.current = unresolvedFare;
          setVoiceStep('fare-type');
          setVoiceFeedback(nextMessage);
          queueVoicePrompt(nextMessage, 'fare-type');
          return;
        }

        const nextMessage = `Please say the route first, like ${routeStart.name} to ${routeEnd.name}.`;
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'fare');
        return;
      }

      const passengerCountResult = parsePassengerCountVoiceTranscript(trimmedTranscript);
      if (passengerCountResult.status === 'match') {
        beginCashFollowUp(fareContext, passengerCountResult.passengerCount, 'queued');
        return;
      }

      const smartAnalysis = await getSmartAnalysis();
      const effectiveTranscript = smartAnalysis?.effectiveTranscript ?? trimmedTranscript;
      const smartPassengerCount = smartAnalysis?.smartPassengerCount ?? null;

      setVoiceTranscript(effectiveTranscript);

      if (typeof smartPassengerCount === 'number' && smartPassengerCount > 0) {
        beginCashFollowUp(fareContext, smartPassengerCount, 'queued');
        return;
      }

      setVoiceFeedback(passengerCountResult.message);
      queueVoicePrompt(passengerCountResult.message, 'passenger-count');
      return;
    }

    if (requestedStep === 'done-check') {
      const localAnswer = parseFareStepBinaryAnswer('done-check', trimmedTranscript);
      const smartAnalysis = localAnswer ? null : await getSmartAnalysis();
      const effectiveTranscript = smartAnalysis?.effectiveTranscript ?? trimmedTranscript;
      const doneAnswer =
        localAnswer ??
        smartAnalysis?.smartBinaryAnswer ??
        parseFareStepBinaryAnswer('done-check', effectiveTranscript) ??
        parseVoiceBinaryAnswer(effectiveTranscript);

      setVoiceTranscript(effectiveTranscript);

      if (doneAnswer === 'yes') {
        setIsConductorCalcOpen(false);
        setVoiceChangePreset(null);
        closeVoicePanelAfterReply('Okay. Calculator closed. Tap the mic anytime when you are ready again.');
        return;
      }

      if (doneAnswer === 'no') {
        setIsConductorCalcOpen(false);
        setVoiceChangePreset(null);
        setActiveVoicePassengerCount(null);
        const nextMessage = lastResolvedVoiceFareRef.current
          ? 'Okay. Compute fare again for the next passenger. Say same route, or say the new pickup and destination now.'
          : 'Okay. Compute fare again for the next passenger. Say the pickup and destination now, or say exit.';
        setVoiceStep('next-passenger');
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'next-passenger');
        return;
      }

      const nextMessage = 'Please say yes if you are done, or say no if you want another fare.';
      setVoiceFeedback(nextMessage);
      queueVoicePrompt(nextMessage, 'done-check');
      return;
    }

    if (requestedStep === 'next-passenger') {
      const localShortcut = parseFareConversationShortcut(trimmedTranscript);
      if (localShortcut && applyVoiceShortcut(localShortcut, confidence, 'fare')) {
        return;
      }

      const parsedFare = parseFareVoiceTranscript(trimmedTranscript, activeRoute);
      if (parsedFare.status === 'match') {
        if (shouldConfirmVoiceInterpretation(confidence)) {
          const confirmMessage =
            parsedFare.fareType === 'either'
              ? `I heard ${parsedFare.originStop.name} to ${parsedFare.destinationStop.name}. Say yes to continue or no to try again.`
              : `I heard ${getResolvedFareLabel(parsedFare).toLowerCase()} fare from ${parsedFare.originStop.name} to ${parsedFare.destinationStop.name}. Say yes or no.`;
          queueVoiceConfirmation(confirmMessage, {
            kind: 'fare-match',
            matchedFare: parsedFare,
            retryStep: 'fare'
          });
          return;
        }

        handleMatchedFare(parsedFare, 'queued');
        return;
      }

      const localClarification = buildRouteClarificationFromTranscript(trimmedTranscript);
      if (localClarification) {
        beginRouteClarification(localClarification.context, 'next-passenger');
        return;
      }

      const localAnswer = parseFareStepBinaryAnswer('next-passenger', trimmedTranscript);
      const smartAnalysis =
        localAnswer || localShortcut
          ? null
          : await getSmartAnalysis();
      const effectiveTranscript = smartAnalysis?.effectiveTranscript ?? trimmedTranscript;
      const smartShortcut = smartAnalysis?.smartShortcut ?? null;
      const smartFareType = smartAnalysis?.smartFareType ?? null;
      const smartMatchedFare = smartAnalysis?.smartMatchedFare ?? null;
      const smartClarificationMessage = smartAnalysis?.smartClarificationMessage ?? null;
      const smartClarificationChoices = smartAnalysis?.smartResult?.clarificationChoices ?? [];
      const smartConfidence = smartAnalysis?.smartConfidence ?? null;
      const nextAnswer =
        localAnswer ??
        smartAnalysis?.smartBinaryAnswer ??
        parseFareStepBinaryAnswer('next-passenger', effectiveTranscript) ??
        parseVoiceBinaryAnswer(effectiveTranscript);

      setVoiceTranscript(effectiveTranscript);

      if (smartShortcut && applyVoiceShortcut(smartShortcut, confidence, 'fare', smartConfidence)) {
        return;
      }

      if (smartMatchedFare) {
        if (shouldConfirmVoiceInterpretation(confidence, smartConfidence)) {
          const confirmMessage =
            smartMatchedFare.fareType === 'either'
              ? `I heard ${smartMatchedFare.originStop.name} to ${smartMatchedFare.destinationStop.name}. Say yes to continue or no to try again.`
              : `I heard ${getResolvedFareLabel(smartMatchedFare).toLowerCase()} fare from ${smartMatchedFare.originStop.name} to ${smartMatchedFare.destinationStop.name}. Say yes or no.`;
          queueVoiceConfirmation(confirmMessage, {
            kind: 'fare-match',
            matchedFare: smartMatchedFare,
            retryStep: 'fare'
          });
          return;
        }

        handleMatchedFare(smartMatchedFare, 'queued');
        return;
      }

      const smartClarification = buildRouteClarificationFromTranscript(
        effectiveTranscript,
        smartFareType ?? 'either',
        smartClarificationChoices
      );
      if (smartClarification) {
        beginRouteClarification(smartClarification.context, 'next-passenger');
        return;
      }

      if (smartClarificationMessage) {
        setPendingVoiceClarification(null);
        setVoiceFeedback(smartClarificationMessage);
        queueVoicePrompt(smartClarificationMessage, 'next-passenger');
        return;
      }

      if (nextAnswer === 'yes') {
        setVoiceStep('fare');
        setVoiceResult(null);
        setPendingVoiceFare(null);
        setActiveVoicePassengerCount(null);
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

      const nextMessage = 'Please say same route, say the new pickup and destination, or say exit.';
      setVoiceFeedback(nextMessage);
      queueVoicePrompt(nextMessage, 'next-passenger');
      return;
    }

    const localShortcut = parseFareConversationShortcut(trimmedTranscript);
    if (localShortcut && applyVoiceShortcut(localShortcut, confidence, requestedStep)) {
      return;
    }

    const fareContext = getActiveVoiceFareContext('cash');

    if (!fareContext) {
      const unresolvedFare = getActiveVoiceFareContext('fare-type');
      if (unresolvedFare) {
        const nextMessage = 'I still need to know if this fare is regular or discounted. Please say regular or discounted.';
        activeVoiceFareRef.current = unresolvedFare;
        setVoiceStep('fare-type');
        setVoiceFeedback(nextMessage);
        queueVoicePrompt(nextMessage, 'fare-type');
        return;
      }

      const nextMessage = `Please say the route first, like ${routeStart.name} to ${routeEnd.name}.`;
      setVoiceFeedback(nextMessage);
      queueVoicePrompt(nextMessage, 'fare');
      return;
    }

    const localCashResult = parseCashVoiceTranscript(trimmedTranscript);
    if (localCashResult.status === 'match') {
      if (shouldConfirmVoiceInterpretation(confidence)) {
        queueVoiceConfirmation(
          `I heard ${localCashResult.amount} pesos for the passenger money. Say yes or no.`,
          {
            kind: 'cash-amount',
            matchedFare: fareContext,
            cashAmount: localCashResult.amount,
            retryStep: 'cash'
          }
        );
        return;
      }

      finishVoiceChangeFlow(
        fareContext,
        localCashResult.amount,
        Math.max(activeVoicePassengerCountRef.current ?? 1, 1)
      );
      return;
    }

    const smartAnalysis = await getSmartAnalysis();
    const effectiveTranscript = smartAnalysis?.effectiveTranscript ?? trimmedTranscript;
    const smartCashAmount = smartAnalysis?.smartCashAmount ?? null;
    const smartConfidence = smartAnalysis?.smartConfidence ?? null;
    const smartShortcut = smartAnalysis?.smartShortcut ?? null;

    setVoiceTranscript(effectiveTranscript);

    if (smartShortcut && applyVoiceShortcut(smartShortcut, confidence, requestedStep, smartConfidence)) {
      return;
    }

    const cashResult =
      smartCashAmount !== null
        ? {
            status: 'match' as const,
            transcript: effectiveTranscript,
            normalized: effectiveTranscript.toLowerCase(),
            amount: smartCashAmount,
            spokenAmount: String(smartCashAmount)
          }
        : parseCashVoiceTranscript(effectiveTranscript);
    if (cashResult.status === 'match') {
      if (shouldConfirmVoiceInterpretation(confidence, smartConfidence)) {
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

        finishVoiceChangeFlow(
          fareContext,
          cashResult.amount,
          Math.max(activeVoicePassengerCountRef.current ?? 1, 1)
        );
        return;
      }

    setVoiceFeedback(localCashResult.message ?? cashResult.message);
    queueVoicePrompt(cashResult.message, 'cash');
  };

  const startFareVoiceRecognition = (
    requestedStep: VoiceAssistantStep = 'fare',
    options?: { autoRestart?: boolean }
  ) => {
    const autoRestart = options?.autoRestart ?? false;
    if (isVoiceListening) {
      clearQueuedVoicePrompt();
      clearVoiceSilenceTimeout();
      clearVoiceAutoRestartTimeout();
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
    clearVoiceAutoRestartTimeout();
    cancelVoiceReply();
    if (requestedStep !== 'confirm') {
      pendingVoiceConfirmationRef.current = null;
    }
    if (!autoRestart) {
      voiceAutoRestartCountRef.current = 0;
    }
    setVoiceStep(requestedStep);
    setVoiceTranscript('');
    setVoiceConfidence(null);
    latestVoiceTranscriptRef.current = '';
    committedVoiceTranscriptRef.current = '';
    latestVoiceConfidenceRef.current = null;
    voiceTranscriptHandledRef.current = false;
    if (requestedStep === 'fare') {
      setVoiceResult(null);
      setPendingVoiceFare(null);
      setActiveVoicePassengerCount(null);
      setVoiceCashAmount(null);
      setVoiceChangePreset(null);
      activeVoiceFareRef.current = null;
    }

    const recognition = new RecognitionCtor();
    voiceRecognitionRef.current = recognition;
    recognition.lang = 'en-PH';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setIsVoiceListening(true);
      latestVoiceTranscriptRef.current = '';
      committedVoiceTranscriptRef.current = '';
      latestVoiceConfidenceRef.current = null;
      voiceTranscriptHandledRef.current = false;
      setVoiceFeedback(getListeningPrompt(requestedStep));
    };
    recognition.onerror = event => {
      clearVoiceSilenceTimeout();
      committedVoiceTranscriptRef.current = '';
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

    const flushTranscriptAfterSilence = (hasFinal: boolean) => {
      clearVoiceSilenceTimeout();
      if (!latestVoiceTranscriptRef.current.trim()) {
        return;
      }

      const silenceDelay = getVoiceSilenceDelay(requestedStep, hasFinal);
      voiceSilenceTimeoutRef.current = window.setTimeout(() => {
        const finalTranscript = latestVoiceTranscriptRef.current.trim();
        if (!finalTranscript || voiceTranscriptHandledRef.current) {
          return;
        }

        voiceTranscriptHandledRef.current = true;
        setVoiceFeedback(`Heard "${finalTranscript}". Processing...`);
        void processFareVoiceTranscript(
          requestedStep,
          finalTranscript,
          latestVoiceConfidenceRef.current
        );
        recognition.stop();
      }, silenceDelay);
    };

    recognition.onresult = event => {
      const { transcript, finalTranscript, interimTranscript, confidence, hasFinal } =
        extractRecognitionTranscript(event);

      if (finalTranscript) {
        committedVoiceTranscriptRef.current = mergeSpeechTranscript(
          committedVoiceTranscriptRef.current,
          finalTranscript
        );
      }

      const resolvedTranscript = mergeSpeechTranscript(
        committedVoiceTranscriptRef.current,
        interimTranscript || transcript
      );

      if (!resolvedTranscript) {
        return;
      }

      latestVoiceTranscriptRef.current = resolvedTranscript;
      latestVoiceConfidenceRef.current = confidence;
      voiceAutoRestartCountRef.current = 0;
      setVoiceTranscript(resolvedTranscript);
      setVoiceConfidence(confidence);

      if (requestedStep === 'passenger-count' && hasFinal) {
        const quickPassengerCount = parsePassengerCountVoiceTranscript(resolvedTranscript);
        if (quickPassengerCount.status === 'match') {
          clearVoiceSilenceTimeout();
          voiceTranscriptHandledRef.current = true;
          setVoiceFeedback(`Heard "${resolvedTranscript}". Processing...`);
          void processFareVoiceTranscript(
            requestedStep,
            resolvedTranscript,
            confidence
          );
          recognition.stop();
          return;
        }
      }

      setVoiceFeedback(
        hasFinal ? `Heard "${resolvedTranscript}". Processing...` : `Heard "${resolvedTranscript}".`
      );
      flushTranscriptAfterSilence(hasFinal);
    };
    recognition.onend = () => {
      setIsVoiceListening(false);
      voiceRecognitionRef.current = null;
      clearVoiceSilenceTimeout();
      if (!voiceTranscriptHandledRef.current && latestVoiceTranscriptRef.current.trim()) {
        void processFareVoiceTranscript(
          requestedStep,
          latestVoiceTranscriptRef.current,
          latestVoiceConfidenceRef.current
        );
        voiceAutoRestartCountRef.current = 0;
        latestVoiceTranscriptRef.current = '';
        committedVoiceTranscriptRef.current = '';
        latestVoiceConfidenceRef.current = null;
        voiceTranscriptHandledRef.current = false;
        flushQueuedVoicePrompt();
        return;
      }

      if (!voiceTranscriptHandledRef.current && !latestVoiceTranscriptRef.current.trim()) {
        if (voiceAutoRestartCountRef.current < 3) {
          voiceAutoRestartCountRef.current += 1;
          setVoiceFeedback(`Still listening for ${getListeningPrompt(requestedStep).replace(/^Listening\.\.\.\s*/i, '').toLowerCase()}`);
          voiceAutoRestartTimeoutRef.current = window.setTimeout(() => {
            voiceAutoRestartTimeoutRef.current = null;
            startFareVoiceRecognition(requestedStep, { autoRestart: true });
          }, 120);
          return;
        }

        queueVoicePrompt(getNoSpeechPrompt(requestedStep), requestedStep);
      }
      latestVoiceTranscriptRef.current = '';
      committedVoiceTranscriptRef.current = '';
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
    clearVisibleVoiceState({ keepMemory: false });
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
    clearVisibleVoiceState({ keepMemory: false });
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
                      : voiceStep === 'passenger-count'
                        ? 'Passenger count'
                      : voiceStep === 'cash'
                        ? 'Passenger money'
                        : voiceStep === 'done-check'
                          ? 'Done or continue'
                        : voiceStep === 'next-passenger'
                          ? 'Next fare'
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

            {voiceClarificationContext && voiceClarificationContext.candidateStops.length > 0 && (
              <div className="mt-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Are you trying to say
                </p>
                <div className="mt-2 grid gap-2">
                  {voiceClarificationContext.candidateStops.slice(0, 4).map(stop => (
                    <button
                      key={`${voiceClarificationContext.routePart}-${stop.name}`}
                      onClick={() => handleClarificationStopChoice(stop)}
                      className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-700 active:scale-[0.99] dark:border-white/10 dark:bg-black/30 dark:text-slate-200"
                    >
                      Use {stop.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  You can tap one above, or keep talking and say the city, municipality, province, or nearby KM-post landmark.
                </p>
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

            {voiceStep === 'done-check' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setIsConductorCalcOpen(false);
                    setVoiceChangePreset(null);
                    setActiveVoicePassengerCount(null);
                    closeVoicePanelAfterReply('Okay. Calculator closed. Tap the mic anytime when you are ready again.');
                  }}
                  className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                  Yes, Done
                </button>
                <button
                  onClick={() => {
                    setIsConductorCalcOpen(false);
                    setVoiceChangePreset(null);
                    setActiveVoicePassengerCount(null);
                    const nextMessage = lastResolvedVoiceFareRef.current
                      ? 'Okay. Compute fare again for the next passenger. Say same route, or say the new pickup and destination now.'
                      : 'Okay. Compute fare again for the next passenger. Say the pickup and destination now, or say exit.';
                    setVoiceStep('next-passenger');
                    setVoiceFeedback(nextMessage);
                    queueVoicePrompt(nextMessage, 'next-passenger');
                  }}
                  className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  No, Next Fare
                </button>
              </div>
            )}

            {voiceStep === 'next-passenger' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={handleUseSameRoute}
                  className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                  Same Route
                </button>
                <button
                  onClick={() => {
                    setVoiceStep('fare');
                    setVoiceResult(null);
                    setPendingVoiceFare(null);
                    setActiveVoicePassengerCount(null);
                    setVoiceCashAmount(null);
                    setVoiceChangePreset(null);
                    const nextMessage = 'Okay. Say the new pickup and destination now.';
                    setVoiceFeedback(nextMessage);
                    queueVoicePrompt(nextMessage, 'fare');
                  }}
                  className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  New Route
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
                {voicePassengerCount !== null && (
                  <div className="rounded-[1.5rem] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:bg-black/30 dark:text-slate-300">
                    Passengers: {voicePassengerCount} / Total Fare: {peso}
                    {getResolvedFareTotal(voiceResult, voicePassengerCount)}
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
                      Ask For Passengers
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
        <div className="rounded-[2rem] border border-slate-200 bg-[#F5F6F7] px-5 py-5 shadow-sm dark:border-white/10 dark:bg-[var(--app-dark-soft)]">
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
          onClick={handleReset}
          className="w-full bg-white dark:bg-night-charcoal py-6 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 shadow-sm transition-all flex items-center justify-center gap-4"
        >
          <span className="material-icons text-primary text-2xl">refresh</span>
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-700 dark:text-slate-300">Reset Route</span>
        </button>

        <div className="space-y-4">
          <button
            onClick={() => {
              setManualPrefill(null);
              setIsManualOpen(true);
            }}
            className="w-full bg-white dark:bg-night-charcoal py-6 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 shadow-sm transition-all flex items-center justify-center gap-3"
          >
            <span className="material-icons text-primary text-2xl">keyboard</span>
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">Manual KM</span>
          </button>
          <button
            onClick={() => setIsMidStopOpen(true)}
            className="w-full bg-white dark:bg-night-charcoal py-6 rounded-[2rem] border border-slate-200 dark:border-white/10 active:scale-95 shadow-sm transition-all flex items-center justify-center gap-3"
          >
            <span className="material-icons text-primary text-2xl">timeline</span>
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">Mid-Stop Est</span>
          </button>
        </div>
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

      <Suspense fallback={null}>
        <StopPickerOverlay
          isOpen={isOriginPickerOpen}
          onClose={() => setIsOriginPickerOpen(false)}
          onSelect={(name) => {
            clearVisibleVoiceState({ keepMemory: false });
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
            clearVisibleVoiceState({ keepMemory: false });
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
        {isMidStopOpen ? (
          <div className="fixed inset-0 z-[170] overflow-y-auto overscroll-contain">
            <BetweenStopsScreen onExit={() => setIsMidStopOpen(false)} />
          </div>
        ) : null}
      </Suspense>
    </div>
  );
};

export default CalcScreen;
