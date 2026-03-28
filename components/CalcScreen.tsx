import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import StopPickerOverlay from './StopPickerOverlay';
import ManualKMOverlay from './ManualKMOverlay';
import ConductorCalcOverlay from './ConductorCalcOverlay';
import LocationAssistOverlay from './LocationAssistOverlay';
import { calculateFare, formatFareRate } from '../utils/fare';
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
  getLocationErrorMessage,
  hasRouteCoordinates,
  isLikelyInAppBrowser,
  openCurrentPageInChrome,
  queryLocationPermissionState,
  requestBestCurrentLocation
} from '../utils/location';
import type { BrowserSpeechRecognition, FareVoiceParseResult } from '../utils/voice';
import {
  formatVoiceConfidence,
  getSpeechRecognitionCtor,
  getSpeechRecognitionErrorMessage,
  parseFareVoiceTranscript
} from '../utils/voice';
import { trackAnalyticsEvent } from '../utils/analytics';

const peso = '\u20B1';
const RECENT_FARE_LIMIT = 4;

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
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
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
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
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
    setIsVoiceListening(false);
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
  }, [activeRoute.id]);

  useEffect(() => {
    return () => {
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

  const handleSwap = () => {
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
    setOrigin(routeStart.name);
    setDestination(routeEnd.name);
    showToast(`Reset to ${activeRoute.shortLabel}`);
  };

  const applyRecentFare = (nextOrigin: string, nextDestination: string) => {
    setOrigin(nextOrigin);
    setDestination(nextDestination);
    showToast(`Loaded ${nextOrigin} to ${nextDestination}`);
  };

  const applyVoiceFare = () => {
    if (!voiceResult || voiceResult.status !== 'match') return;

    setOrigin(voiceResult.originStop.name);
    setDestination(voiceResult.destinationStop.name);
    showToast(`Voice set ${voiceResult.originStop.name} to ${voiceResult.destinationStop.name}`);
  };

  const startFareVoiceRecognition = () => {
    if (isVoiceListening) {
      voiceRecognitionRef.current?.stop();
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setVoiceFeedback('Voice command is not available in this browser. Use Chrome on Android for the best result.');
      showToast('Voice command needs Chrome on Android or a supported browser.', 'info');
      return;
    }

    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceFeedback(null);
    setVoiceResult(null);

    const recognition = new RecognitionCtor();
    voiceRecognitionRef.current = recognition;
    recognition.lang = 'en-PH';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setIsVoiceListening(true);
      setVoiceFeedback('Listening... say a fare like "Bayambang to Baguio discounted".');
    };
    recognition.onerror = event => {
      const nextMessage = getSpeechRecognitionErrorMessage(event.error);
      setVoiceFeedback(nextMessage);
      setIsVoiceListening(false);
      showToast(nextMessage, 'info');
    };
    recognition.onresult = event => {
      const recognitionResult = event.results[event.results.length - 1];
      const alternative = recognitionResult?.[0];
      const transcript = alternative?.transcript?.trim() ?? '';
      const confidence = typeof alternative?.confidence === 'number' ? alternative.confidence : null;
      const parsed = parseFareVoiceTranscript(transcript, activeRoute);

      setVoiceTranscript(transcript);
      setVoiceConfidence(confidence);
      setVoiceResult(parsed);
      setVoiceFeedback(
        parsed.status === 'match'
          ? 'Review the heard route below, then tap Use Voice Fare.'
          : parsed.message
      );
      if (parsed.status === 'match') {
        showToast('Voice fare ready. Review it before using.', 'success');
      }
    };
    recognition.onend = () => {
      setIsVoiceListening(false);
      voiceRecognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setIsVoiceListening(false);
      setVoiceFeedback('Voice recognition could not start. Please try again.');
    }
  };

  const requestCurrentLocation = async () => {
    setIsLocationAssistOpen(true);
    setIsLocating(true);
    setLocationError(null);
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

      const nextLocation: CurrentLocationSnapshot = await requestBestCurrentLocation();
      const nextNearestStop = findNearestMappedStop(activeRoute.stops, nextLocation);
      const nextSegmentMatch = findNearestMappedSegment(activeRoute.stops, nextLocation);
      setCurrentLocation(nextLocation);
      setNearestStopMatch(nextNearestStop);
      setNearestSegmentMatch(nextSegmentMatch);
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
    setOrigin(stopName);
    setIsLocationAssistOpen(false);
    showToast(`Pickup set to ${stopName}`);
  };

  const handleUseManualKmFromLocation = (pickupKm: number) => {
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
          onClick={() => setIsConductorCalcOpen(true)}
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
          <button
            onClick={startFareVoiceRecognition}
            className={`px-5 py-2 rounded-full border shadow-sm active:scale-95 transition-all flex items-center gap-2 ${
              isVoiceListening
                ? 'border-primary bg-primary text-white'
                : 'border-primary/10 bg-white text-primary dark:bg-night-charcoal'
            }`}
          >
            <span className="material-icons text-sm">{isVoiceListening ? 'mic' : 'mic_none'}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              {isVoiceListening ? 'Listening' : 'Voice Fare'}
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
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Voice Fare</p>
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                  {voiceFeedback ?? 'Voice command ready.'}
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

            {voiceResult?.status === 'match' && (
              <div className="mt-4 grid gap-3">
                <div className="flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-black/30">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary">Parsed Route</p>
                    <p className="mt-2 text-base font-black text-slate-900 dark:text-white">
                      {voiceResult.originStop.name} to {voiceResult.destinationStop.name}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {voiceResult.distance.toFixed(1).replace(/\.0$/, '')} km • {voiceResult.fareType}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Answer</p>
                    <p className="mt-1 text-xl font-900 text-primary">
                      {peso}{voiceResult.fareType === 'discounted' ? voiceResult.discountedFare : voiceResult.regularFare}
                    </p>
                  </div>
                </div>
                {voiceResult.fareType === 'either' && (
                  <div className="rounded-[1.5rem] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:bg-black/30 dark:text-slate-300">
                    Regular {peso}{voiceResult.regularFare} • Discounted {peso}{voiceResult.discountedFare}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={applyVoiceFare}
                    className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                  >
                    Use Voice Fare
                  </button>
                  <button
                    onClick={startFareVoiceRecognition}
                    className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  >
                    Speak Again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-5 space-y-2 relative mb-6">
        <button
          onClick={() => setIsOriginPickerOpen(true)}
          className="w-full bg-white dark:bg-night-charcoal rounded-[2rem] p-8 border border-slate-100 dark:border-white/10 text-left flex items-start justify-between gap-4 shadow-sm active:bg-slate-50 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">Pickup Point</p>
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
          onClick={() => setIsDestPickerOpen(true)}
          className="w-full bg-white dark:bg-night-charcoal rounded-[2rem] p-8 border border-slate-100 dark:border-white/10 text-left flex items-start justify-between gap-4 shadow-sm active:bg-slate-50 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">Destination</p>
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
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Recent Fares</h2>
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

      <StopPickerOverlay isOpen={isOriginPickerOpen} onClose={() => setIsOriginPickerOpen(false)} onSelect={(name) => { setOrigin(name); setIsOriginPickerOpen(false); }} title="Pickup" />
      <StopPickerOverlay isOpen={isDestPickerOpen} onClose={() => setIsDestPickerOpen(false)} onSelect={(name) => { setDestination(name); setIsDestPickerOpen(false); }} title="Destination" />
      <ManualKMOverlay
        isOpen={isManualOpen}
        onClose={() => {
          setIsManualOpen(false);
          setManualPrefill(null);
        }}
        initialPickupKm={manualPrefill?.pickupKm ?? null}
        initialDestKm={manualPrefill?.destKm ?? null}
      />
      <ConductorCalcOverlay isOpen={isConductorCalcOpen} onClose={() => setIsConductorCalcOpen(false)} initialValue={calculation.reg} />
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
        onClose={() => setIsLocationAssistOpen(false)}
        onOpenInChrome={handleOpenInChrome}
        onRetry={requestCurrentLocation}
        onUseStop={(stop) => handleUseDetectedStop(stop.name)}
        onUseManualKm={handleUseManualKmFromLocation}
      />
    </div>
  );
};

export default CalcScreen;
