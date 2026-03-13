import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import StopPickerOverlay from './StopPickerOverlay';
import ManualKMOverlay from './ManualKMOverlay';
import ConductorCalcOverlay from './ConductorCalcOverlay';
import LocationAssistOverlay from './LocationAssistOverlay';
import { calculateFare, formatFareRate } from '../utils/fare';
import type { CurrentLocationSnapshot, StopMatch } from '../utils/location';
import { findNearestMappedStop, hasRouteCoordinates } from '../utils/location';

const peso = '\u20B1';

const CalcScreen: React.FC = () => {
  const { activeRoute, origin, destination, setOrigin, setDestination, addRecord, setActiveFare, showToast } = useApp();
  const [isOriginPickerOpen, setIsOriginPickerOpen] = useState(false);
  const [isDestPickerOpen, setIsDestPickerOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isConductorCalcOpen, setIsConductorCalcOpen] = useState(false);
  const [isLocationAssistOpen, setIsLocationAssistOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<CurrentLocationSnapshot | null>(null);
  const [nearestStopMatch, setNearestStopMatch] = useState<StopMatch | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

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
      return;
    }

    setNearestStopMatch(findNearestMappedStop(activeRoute.stops, currentLocation));
  }, [activeRoute.stops, currentLocation]);

  const fareGuideLines = useMemo(() => {
    const previousFare = activeRoute.fare.previousFare;
    const roundingLine =
      activeRoute.fare.roundingMode === 'standard'
        ? 'Final fare uses standard rounding to the nearest peso.'
        : 'Final fare uses the legacy route rounding before minimum fare.';

    if (previousFare) {
      const regularIncrease = activeRoute.fare.regularRate - previousFare.regularRate;
      const discountedIncrease = activeRoute.fare.discountRate - previousFare.discountRate;
      const minimumRegularIncrease =
        typeof activeRoute.fare.minimumRegularFare === 'number' &&
        typeof previousFare.minimumRegularFare === 'number'
          ? activeRoute.fare.minimumRegularFare - previousFare.minimumRegularFare
          : null;
      const minimumDiscountIncrease =
        typeof activeRoute.fare.minimumDiscountFare === 'number' &&
        typeof previousFare.minimumDiscountFare === 'number'
          ? activeRoute.fare.minimumDiscountFare - previousFare.minimumDiscountFare
          : null;

      return [
        minimumRegularIncrease !== null && minimumDiscountIncrease !== null
          ? `Minimum: +${minimumRegularIncrease.toFixed(0)} pesos regular / +${minimumDiscountIncrease.toFixed(0)} pesos discounted.`
          : 'Minimum fare follows the current route setup.',
        `Beyond minimum: +${regularIncrease.toFixed(2)}/km regular, +${discountedIncrease.toFixed(2)}/km discounted.`,
        `Current rate: ${formatFareRate(activeRoute.fare.regularRate)}/km regular, ${formatFareRate(activeRoute.fare.discountRate)}/km discounted.`,
        roundingLine
      ];
    }

    const minimumLine =
      typeof activeRoute.fare.minimumRegularFare === 'number' &&
      typeof activeRoute.fare.minimumDiscountFare === 'number'
        ? `Minimum fares: ${activeRoute.fare.minimumRegularFare} regular / ${activeRoute.fare.minimumDiscountFare} discounted.`
        : 'No minimum fare configured for this route.';

    return [
      `Formula: KM difference x ${formatFareRate(activeRoute.fare.regularRate)} regular.`,
      `Discounted: ${formatFareRate(activeRoute.fare.discountRate)}/km.`,
      roundingLine,
      minimumLine
    ];
  }, [activeRoute]);

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

  const requestCurrentLocation = () => {
    setIsLocationAssistOpen(true);
    setIsLocating(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setIsLocating(false);
      setCurrentLocation(null);
      setNearestStopMatch(null);
      setLocationError('This device or browser does not support GPS location.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const nextLocation: CurrentLocationSnapshot = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };

        setCurrentLocation(nextLocation);
        setNearestStopMatch(findNearestMappedStop(activeRoute.stops, nextLocation));
        setIsLocating(false);
      },
      error => {
        setCurrentLocation(null);
        setNearestStopMatch(null);
        setIsLocating(false);

        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('Location permission was denied. You can still choose the pickup stop manually.');
          return;
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationError('Current location could not be determined. Move to an open area and try again.');
          return;
        }

        if (error.code === error.TIMEOUT) {
          setLocationError('Location request timed out. Try again once GPS is stable.');
          return;
        }

        setLocationError('Unable to read your current location right now.');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  const handleUseDetectedStop = (stopName: string) => {
    setOrigin(stopName);
    setIsLocationAssistOpen(false);
    showToast(`Pickup set to ${stopName}`);
  };

  return (
    <div className="flex flex-col min-h-full animate-fade-in pb-24 bg-[#f8f6f6] dark:bg-black">
      <header className="bg-primary text-white px-6 py-4 flex items-center justify-between shadow-lg sticky top-0 z-40 h-[72px]">
        <div className="flex items-center gap-3">
          <span className="material-icons text-2xl">calculate</span>
          <h1 className="text-xl font-medium tracking-tight">Fare Calculator</h1>
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
        <span className="bg-white dark:bg-night-charcoal border border-primary/10 text-primary px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-sm text-center">
          {activeRoute.label}
        </span>
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

      <div className="px-5 space-y-2 relative mb-8">
        <button
          onClick={() => setIsOriginPickerOpen(true)}
          className="w-full bg-white dark:bg-night-charcoal rounded-[2rem] p-8 border border-slate-100 dark:border-white/10 text-left flex justify-between items-center shadow-sm active:bg-slate-50 transition-colors"
        >
          <div>
            <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">Pickup Point</p>
            <h2 className="text-3xl font-800 text-slate-800 dark:text-white leading-tight">KM {formatKM(originStop.km)} - {origin}</h2>
          </div>
          <span className="material-icons text-slate-300">chevron_right</span>
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
          className="w-full bg-white dark:bg-night-charcoal rounded-[2rem] p-8 border border-slate-100 dark:border-white/10 text-left flex justify-between items-center shadow-sm active:bg-slate-50 transition-colors"
        >
          <div>
            <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">Destination</p>
            <h2 className="text-3xl font-800 text-slate-800 dark:text-white leading-tight">KM {formatKM(destStop.km)} - {destination}</h2>
          </div>
          <span className="material-icons text-slate-300">chevron_right</span>
        </button>
      </div>

      <div className="px-5 mb-8">
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
                <div className="space-y-1 animate-fade-in text-[10px] font-black text-slate-700/80 dark:text-slate-400/80 uppercase">
                  <p>- {formatKM(distance)} km x {peso}{formatFareRate(activeRoute.fare.regularRate)} = {peso}{calculation.rawReg.toFixed(2)} (Reg)</p>
                  <p>- {formatKM(distance)} km x {peso}{formatFareRate(activeRoute.fare.discountRate)} = {peso}{calculation.rawDisc.toFixed(2)} (Disc)</p>
                  <p>- Final: {activeRoute.fare.roundingMode === 'standard' ? 'Standard rounding' : 'Legacy route rounding'} {calculation.isMinApplied && '(Min. Applied)'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 mb-8">
        <div className="bg-white dark:bg-night-charcoal rounded-[2rem] border border-slate-200 dark:border-white/10 px-5 py-4 shadow-sm">
          <p className="text-[9px] font-black text-primary uppercase tracking-[0.2em] mb-2">Fare Guide</p>
          <div className="space-y-1">
            {fareGuideLines.map(line => (
              <p key={line} className="text-xs font-black text-slate-700 dark:text-slate-300 leading-relaxed uppercase">
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4 pb-10">
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
          onClick={() => setIsManualOpen(true)}
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
      <ManualKMOverlay isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
      <ConductorCalcOverlay isOpen={isConductorCalcOpen} onClose={() => setIsConductorCalcOpen(false)} initialValue={calculation.reg} />
      <LocationAssistOverlay
        isOpen={isLocationAssistOpen}
        isLoading={isLocating}
        routeLabel={activeRoute.label}
        location={currentLocation}
        nearestMatch={nearestStopMatch}
        hasMappedStops={routeHasMappedStops}
        error={locationError}
        onClose={() => setIsLocationAssistOpen(false)}
        onRetry={requestCurrentLocation}
        onUseStop={(stop) => handleUseDetectedStop(stop.name)}
      />
    </div>
  );
};

export default CalcScreen;
