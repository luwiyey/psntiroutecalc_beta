import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import FloatingVoiceButton from './FloatingVoiceButton';
import { formatRouteEndpointCompact, formatRouteEndpointSummary } from '../utils/route-distance';
import type { BrowserSpeechRecognition, StopVoiceParseResult } from '../utils/voice';
import {
  formatVoiceConfidence,
  getSpeechRecognitionCtor,
  getSpeechRecognitionErrorMessage,
  parseStopVoiceTranscript
} from '../utils/voice';
import { buildGoogleMapsSearchUrl, openGoogleMapsUrl } from '../utils/google-maps';
import {
  findNearestMappedSegment,
  findNearestMappedStop,
  type SegmentMatch,
  type StopMatch
} from '../utils/location';
import {
  hasGoogleMapsAssistConfig,
  searchGooglePlaceCandidates,
  type GooglePlaceCandidate
} from '../utils/google-maps-assist';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
  title: string;
  mode?: 'pickup' | 'destination';
  onRecommendManualKm?: (pickupKm: number, placeLabel?: string) => void;
  initialSearch?: string;
  suggestedStops?: string[];
  helperMessage?: string | null;
}

interface GooglePlaceResolution {
  candidate: GooglePlaceCandidate;
  nearestMatch: StopMatch | null;
  segmentMatch: SegmentMatch | null;
  recommendation: 'exact-stop' | 'manual-km' | 'unresolved';
}

const StopPickerOverlay: React.FC<Props> = ({
  isOpen,
  onClose,
  onSelect,
  title,
  mode = 'destination',
  onRecommendManualKm,
  initialSearch = '',
  suggestedStops = [],
  helperMessage = null
}) => {
  const [search, setSearch] = useState('');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const [voiceStopResult, setVoiceStopResult] = useState<StopVoiceParseResult | null>(null);
  const [isGoogleSearching, setIsGoogleSearching] = useState(false);
  const [googleSearchError, setGoogleSearchError] = useState<string | null>(null);
  const [googleResults, setGoogleResults] = useState<GooglePlaceCandidate[]>([]);
  const [googleResolution, setGoogleResolution] = useState<GooglePlaceResolution | null>(null);
  const { activeRoute } = useApp();
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const canUseVoiceRecognition = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);
  const routeStart = activeRoute.stops[0];
  const routeEnd = activeRoute.stops[activeRoute.stops.length - 1];
  const routeStartName = routeStart?.name ?? 'Route Start';
  const routeEndName = routeEnd?.name ?? 'Route End';
  const routeStartKm = routeStart?.km ?? 0;
  const routeEndKm = routeEnd?.km ?? routeStartKm;
  const pickerHeading =
    mode === 'pickup'
      ? 'Pick Or Search Pickup'
      : mode === 'destination'
        ? 'Pick Or Search Destination'
        : `Pick Or Search ${title}`;
  const searchLabel =
    mode === 'pickup'
      ? 'pickup stop'
      : mode === 'destination'
        ? 'destination stop'
        : title.toLowerCase();

  useEffect(() => {
    if (isOpen) {
      setSearch(initialSearch);
      setIsVoiceListening(false);
      setVoiceTranscript('');
      setVoiceFeedback(null);
      setVoiceConfidence(null);
      setVoiceStopResult(null);
      setIsGoogleSearching(false);
      setGoogleSearchError(null);
      setGoogleResults([]);
      setGoogleResolution(null);
    }
  }, [activeRoute.id, initialSearch, isOpen]);

  useEffect(() => {
    return () => {
      voiceRecognitionRef.current?.abort();
      voiceRecognitionRef.current = null;
    };
  }, []);

  if (!isOpen) return null;

  const searchText = search.trim().toLowerCase();
  const filteredStops = activeRoute.stops.filter(stop => {
    if (!searchText) return true;

    return (
      stop.name.toLowerCase().includes(searchText) ||
      stop.aliases?.some(alias => alias.toLowerCase().includes(searchText)) ||
      `km ${stop.km}`.includes(searchText)
    );
  });

  const formatKM = (km: number) => (km % 1 === 0 ? km.toString() : km.toFixed(1));

  const applyVoiceStop = () => {
    if (!voiceStopResult || voiceStopResult.status !== 'match') return;
    onSelect(voiceStopResult.stop.name);
  };

  const startVoiceStopPicker = () => {
    if (isVoiceListening) {
      voiceRecognitionRef.current?.stop();
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setVoiceFeedback('Voice command is not available in this browser. Use Chrome on Android for the best result.');
      return;
    }

    setVoiceTranscript('');
    setVoiceConfidence(null);
    setVoiceFeedback('Listening... say a stop name, then confirm it below.');
    setVoiceStopResult(null);

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
      const parsed = parseStopVoiceTranscript(transcript, activeRoute);

      setVoiceTranscript(transcript);
      setVoiceConfidence(confidence);
      setVoiceStopResult(parsed);
      setVoiceFeedback(parsed.status === 'match' ? `Heard ${parsed.stop.name}. Tap Use Stop to confirm.` : parsed.message);
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

  const searchGooglePlaces = async () => {
    const trimmedQuery = search.trim();

    if (!trimmedQuery) {
      setGoogleSearchError(`Type a ${title.toLowerCase()} or landmark first.`);
      setGoogleResults([]);
      setGoogleResolution(null);
      return;
    }

    if (!hasGoogleMapsAssistConfig()) {
      openGoogleMapsUrl(buildGoogleMapsSearchUrl(trimmedQuery));
      return;
    }

    setIsGoogleSearching(true);
    setGoogleSearchError(null);
    setGoogleResolution(null);

    try {
      const results = await searchGooglePlaceCandidates(`${trimmedQuery} ${activeRoute.label} Philippines`);
      setGoogleResults(results);
      if (results.length === 0) {
        setGoogleSearchError('No Google place matches were found for that search.');
      }
    } catch (error) {
      setGoogleResults([]);
      setGoogleSearchError(error instanceof Error ? error.message : 'Unable to search Google places right now.');
    } finally {
      setIsGoogleSearching(false);
    }
  };

  const resolveGoogleCandidate = (candidate: GooglePlaceCandidate): GooglePlaceResolution => {
    const syntheticLocation = {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      accuracy: 25,
      timestamp: Date.now(),
      source: 'browser' as const
    };
    const nearestMatch = findNearestMappedStop(activeRoute.stops, syntheticLocation);
    const segmentMatch = findNearestMappedSegment(activeRoute.stops, syntheticLocation);
    const suggestedRadius = nearestMatch?.stop.radiusMeters ?? 60;
    const isExactStop =
      Boolean(nearestMatch) &&
      nearestMatch!.distanceMeters <= Math.max(suggestedRadius, 90) &&
      (!segmentMatch || Math.abs(segmentMatch.estimatedKm - nearestMatch!.stop.km) <= 0.1);

    return {
      candidate,
      nearestMatch,
      segmentMatch,
      recommendation: isExactStop ? 'exact-stop' : segmentMatch ? 'manual-km' : 'unresolved'
    };
  };

  const handleSelectGoogleCandidate = (candidate: GooglePlaceCandidate) => {
    const resolution = resolveGoogleCandidate(candidate);
    setGoogleResolution(resolution);
    setGoogleResults([]);

    if (resolution.recommendation === 'exact-stop' && resolution.nearestMatch) {
      onSelect(resolution.nearestMatch.stop.name);
    }
  };

  const handleUseResolvedManualKm = () => {
    if (!googleResolution?.segmentMatch || !onRecommendManualKm) {
      return;
    }

    onRecommendManualKm(googleResolution.segmentMatch.estimatedKm, googleResolution.candidate.name);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white animate-fade-in dark:bg-black">
      <header
        className="flex items-center justify-between border-b border-slate-100 px-4 pb-4 dark:border-white/10"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <button onClick={onClose} className="-ml-2 p-2 transition-opacity active:opacity-50">
          <span className="material-icons text-slate-600 dark:text-white">chevron_left</span>
        </button>
        <h1 className="text-sm font-900 uppercase tracking-widest text-slate-800 dark:text-white">{pickerHeading}</h1>
        <div className="w-10" />
      </header>

      <div className="bg-slate-50 p-4 dark:bg-night-charcoal">
        <div className="relative mb-5">
          <span className="material-icons absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input
            autoFocus
            className="w-full rounded-2xl border-2 border-slate-100 bg-white py-4 pl-12 pr-4 font-bold text-slate-800 outline-none transition-colors caret-primary focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-white/10 dark:bg-black dark:text-white"
            placeholder={`Search ${searchLabel} or nearby place...`}
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>

        {helperMessage ? (
          <div className="mb-4 rounded-[1.5rem] border border-primary/10 bg-primary/[0.06] px-4 py-4">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-200">{helperMessage}</p>
          </div>
        ) : null}

        {suggestedStops.length > 0 && (
          <div className="mb-4">
            <p className="ml-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Suggested Exact Stops</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestedStops.map(stopName => (
                <button
                  key={stopName}
                  type="button"
                  onClick={() => onSelect(stopName)}
                  className="rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-primary active:scale-95"
                >
                  {stopName}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => void searchGooglePlaces()}
          className="mb-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 active:scale-95 dark:border-white/10 dark:bg-black/30 dark:text-slate-200"
        >
          {isGoogleSearching ? 'Searching Google...' : 'Search Place In Google'}
        </button>

        {googleSearchError && (
          <div className="mb-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-400/20 dark:bg-amber-400/10">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-600">Place Search</p>
            <p className="mt-2 text-sm font-bold text-amber-700 dark:text-amber-200">{googleSearchError}</p>
          </div>
        )}

        {googleResults.length > 0 && (
          <div className="mb-4 space-y-2">
            {googleResults.map(place => (
              <button
                key={place.placeId}
                type="button"
                onClick={() => handleSelectGoogleCandidate(place)}
                className="w-full rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm active:scale-[0.99] dark:border-white/10 dark:bg-black/30"
              >
                <p className="text-sm font-black text-slate-800 dark:text-white">{place.name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-300">{place.formattedAddress}</p>
              </button>
            ))}
          </div>
        )}

        {googleResolution && googleResolution.recommendation !== 'exact-stop' && (
          <div className="mb-4 rounded-[1.5rem] border border-primary/15 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-black/30">
            <p className="text-[9px] font-black uppercase tracking-widest text-primary">Place Matched To Route</p>
            <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">{googleResolution.candidate.name}</p>
            {googleResolution.segmentMatch ? (
              <>
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                  Approx. KM {formatKM(googleResolution.segmentMatch.estimatedKm)} between {googleResolution.segmentMatch.startStop.name} and {googleResolution.segmentMatch.endStop.name}
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                  This place sits between KM-post stops, so Manual KM is safer than forcing one exact stop.
                </p>
                {mode === 'pickup' && onRecommendManualKm && (
                  <button
                    type="button"
                    onClick={handleUseResolvedManualKm}
                    className="mt-3 w-full rounded-[1.25rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                  >
                    Use Manual KM
                  </button>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                Google found the place, but the app could not safely match it to a KM-post stop on this route yet.
              </p>
            )}
            <button
              type="button"
              onClick={() => openGoogleMapsUrl(buildGoogleMapsSearchUrl(googleResolution.candidate.name))}
              className="mt-3 w-full rounded-[1.25rem] border border-primary/20 bg-primary/5 py-3 text-[10px] font-black uppercase tracking-widest text-primary active:scale-95"
            >
              Open In Google Maps
            </button>
          </div>
        )}

        {(voiceFeedback || voiceTranscript || voiceStopResult) && (
          <div className="mb-4 rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-black/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-primary">Voice Stop Picker</p>
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">{voiceFeedback}</p>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {formatVoiceConfidence(voiceConfidence)}
              </p>
            </div>
            {voiceTranscript && (
              <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-300">Heard: "{voiceTranscript}"</p>
            )}
            {voiceStopResult?.status === 'match' && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={applyVoiceStop}
                  className="rounded-full bg-primary px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                  Use Stop
                </button>
                <button
                  onClick={startVoiceStopPicker}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  Speak Again
                </button>
              </div>
            )}
          </div>
        )}

        <p className="mb-3 ml-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Quick Access Terminals</p>
        <div className="grid grid-cols-3 gap-2">
          {activeRoute.stops.filter(stop => stop.isTerminal).map(terminal => (
            <button
              key={`${terminal.km}-${terminal.name}`}
              onClick={() => onSelect(terminal.name)}
              className="flex flex-col items-center gap-1 rounded-xl border border-primary/20 bg-red-50 p-3 text-primary shadow-sm transition-all active:bg-primary active:text-white dark:bg-primary/20"
            >
              <span className="material-icons text-sm opacity-70">location_on</span>
              <span className="w-full truncate text-center text-[10px] font-black uppercase tracking-tighter">{terminal.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="visible-scrollbar flex-1 overflow-y-auto px-4 divide-y dark:divide-white/5">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white py-4 dark:bg-black">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Route Stops</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">KM / Route Ends</span>
        </div>
        {filteredStops.map(stop => (
          <button
            key={`${stop.km}-${stop.name}`}
            onClick={() => onSelect(stop.name)}
            className="group flex w-full items-center justify-between py-5 text-left transition-colors active:bg-slate-50 dark:active:bg-white/5"
          >
            <div className="mr-4 flex flex-1 items-center gap-4">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary transition-transform group-active:scale-150" />
              <div className="min-w-0">
                <span className="block text-left text-xl font-800 leading-tight text-slate-800 dark:text-white">{stop.name}</span>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {stop.coverageRange}
                  {stop.coverageRange ? ' | ' : ''}
                  {formatRouteEndpointSummary(stop.km, routeStartKm, routeEndKm, routeStartName, routeEndName)}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span className="inline-block rounded-md border border-primary/10 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-primary">
                KM {formatKM(stop.km)}
              </span>
              <p className="mt-1 text-[10px] font-black uppercase tracking-tight text-slate-400">
                {formatRouteEndpointCompact(stop.km, routeStartKm, routeEndKm, routeStartName, routeEndName)}
              </p>
            </div>
          </button>
        ))}

        {filteredStops.length === 0 && (
          <div className="py-20 text-center opacity-30">
            <span className="material-icons text-5xl">search_off</span>
            <p className="mt-2 font-bold">No stops match "{search}"</p>
          </div>
        )}
      </div>

      <div style={{ height: 'calc(env(safe-area-inset-bottom) + 12px)' }} className="shrink-0 bg-white dark:bg-black" />

      <FloatingVoiceButton
        active={isVoiceListening}
        disabled={!canUseVoiceRecognition}
        label={`Voice ${title}`}
        title={canUseVoiceRecognition ? `Voice ${title}` : 'Voice not available in this browser'}
        onActivate={startVoiceStopPicker}
      />
    </div>
  );
};

export default StopPickerOverlay;
