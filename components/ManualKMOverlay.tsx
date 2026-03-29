import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { calculateFare } from '../utils/fare';
import type { Stop } from '../types';
import { formatRouteEndpointSummary } from '../utils/route-distance';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialPickupKm?: number | null;
  initialDestKm?: number | null;
}

interface KmPlaceHint {
  tone: 'default' | 'exact' | 'warning';
  title: string;
  detail?: string;
  nearestStop?: Stop | null;
  snappedKm?: number | null;
  exact: boolean;
}

const peso = '\u20B1';

const resolveKmHint = (
  rawValue: string,
  stops: Stop[],
  minKm: number,
  maxKm: number,
  routeStartKm: number,
  routeEndKm: number,
  routeStartName: string,
  routeEndName: string
): KmPlaceHint | null => {
  if (!rawValue.trim()) return null;

  const parsedKm = parseFloat(rawValue);
  if (Number.isNaN(parsedKm)) {
    return {
      tone: 'warning',
      title: 'Enter numbers only',
      exact: false
    };
  }

  if (parsedKm < minKm || parsedKm > maxKm) {
    return {
      tone: 'warning',
      title: 'Outside route range',
      detail: `Route only covers KM ${minKm} to ${maxKm}`,
      exact: false
    };
  }

  const sortedStops = [...stops].sort((left, right) => left.km - right.km);
  const exactStop = sortedStops.find(stop => stop.km === parsedKm);
  const endpointSummary = formatRouteEndpointSummary(
    parsedKm,
    routeStartKm,
    routeEndKm,
    routeStartName,
    routeEndName
  );

  if (exactStop) {
    return {
      tone: 'exact',
      title: exactStop.name,
      detail: [
        exactStop.coverageRange ? `Coverage ${exactStop.coverageRange}` : `Exact stop at KM ${exactStop.km}`,
        endpointSummary
      ].join(' • '),
      nearestStop: exactStop,
      snappedKm: exactStop.km,
      exact: true
    };
  }

  let previousStop = sortedStops[0];
  let nextStop = sortedStops[sortedStops.length - 1];

  for (let index = 0; index < sortedStops.length; index += 1) {
    const stop = sortedStops[index];
    if (stop.km < parsedKm) {
      previousStop = stop;
      continue;
    }

    nextStop = stop;
    break;
  }

  const nearestStop =
    Math.abs(parsedKm - previousStop.km) <= Math.abs(nextStop.km - parsedKm)
      ? previousStop
      : nextStop;

  if (previousStop.km === nextStop.km) {
    return {
      tone: 'default',
      title: `Near ${nearestStop.name}`,
      detail: `No exact KM post at ${parsedKm}. Closest recorded stop is KM ${nearestStop.km} • ${endpointSummary}`,
      nearestStop,
      snappedKm: nearestStop.km,
      exact: false
    };
  }

  return {
    tone: 'default',
    title: `Near ${nearestStop.name}`,
    detail: `No exact KM post at ${parsedKm}. Between ${previousStop.name} (KM ${previousStop.km}) and ${nextStop.name} (KM ${nextStop.km}) • nearest official stop KM ${nearestStop.km} • ${endpointSummary}`,
    nearestStop,
    snappedKm: nearestStop.km,
    exact: false
  };
};

const formatEditableKm = (km: number) => {
  if (Number.isInteger(km)) return km.toFixed(0);
  return km.toFixed(2).replace(/\.?0+$/, '');
};

const sanitizeKmInput = (value: string) =>
  value
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1')
    .slice(0, 6);

const buildRecordLabel = (rawValue: string, hint: KmPlaceHint | null, fallbackPrefix: string) => {
  const parsedKm = parseFloat(rawValue);

  if (!hint?.nearestStop || Number.isNaN(parsedKm)) {
    return `${fallbackPrefix} KM ${rawValue}`;
  }

  if (hint.exact) {
    return `KM ${formatEditableKm(hint.nearestStop.km)} - ${hint.nearestStop.name}`;
  }

  return `KM ${formatEditableKm(hint.snappedKm ?? hint.nearestStop.km)} - ${hint.nearestStop.name} (from KM ${formatEditableKm(parsedKm)})`;
};

const ManualKMOverlay: React.FC<Props> = ({
  isOpen,
  onClose,
  initialPickupKm = null,
  initialDestKm = null
}) => {
  const { activeRoute, addRecord, showToast } = useApp();
  const [pickup, setPickup] = useState('');
  const [dest, setDest] = useState('');
  const [activeInput, setActiveInput] = useState<'pickup' | 'dest'>('pickup');
  const [useCustomKeypad, setUseCustomKeypad] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isPunchTypeOpen, setIsPunchTypeOpen] = useState(false);

  const pickupRef = useRef<HTMLInputElement>(null);
  const destRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPickup(typeof initialPickupKm === 'number' ? formatEditableKm(initialPickupKm) : '');
      setDest(typeof initialDestKm === 'number' ? formatEditableKm(initialDestKm) : '');
      setActiveInput('pickup');
      window.setTimeout(() => pickupRef.current?.focus(), 300);
    } else {
      setIsPunchTypeOpen(false);
    }
  }, [initialDestKm, initialPickupKm, isOpen]);

  const routeMinKm = useMemo(() => Math.min(...activeRoute.stops.map(stop => stop.km)), [activeRoute.stops]);
  const routeMaxKm = useMemo(() => Math.max(...activeRoute.stops.map(stop => stop.km)), [activeRoute.stops]);
  const routeStartName = useMemo(() => activeRoute.stops[0]?.name ?? 'Route Start', [activeRoute.stops]);
  const routeEndName = useMemo(() => activeRoute.stops[activeRoute.stops.length - 1]?.name ?? 'Route End', [activeRoute.stops]);
  const routeStartKm = useMemo(() => activeRoute.stops[0]?.km ?? routeMinKm, [activeRoute.stops, routeMinKm]);
  const routeEndKm = useMemo(() => activeRoute.stops[activeRoute.stops.length - 1]?.km ?? routeMaxKm, [activeRoute.stops, routeMaxKm]);

  const parsedPickup = useMemo(() => parseFloat(pickup), [pickup]);
  const parsedDest = useMemo(() => parseFloat(dest), [dest]);
  const pickupHint = useMemo(
    () =>
      resolveKmHint(
        pickup,
        activeRoute.stops,
        routeMinKm,
        routeMaxKm,
        routeStartKm,
        routeEndKm,
        routeStartName,
        routeEndName
      ),
    [activeRoute.stops, pickup, routeEndKm, routeEndName, routeMaxKm, routeMinKm, routeStartKm, routeStartName]
  );
  const destHint = useMemo(
    () =>
      resolveKmHint(
        dest,
        activeRoute.stops,
        routeMinKm,
        routeMaxKm,
        routeStartKm,
        routeEndKm,
        routeStartName,
        routeEndName
      ),
    [activeRoute.stops, dest, routeEndKm, routeEndName, routeMaxKm, routeMinKm, routeStartKm, routeStartName]
  );

  const effectivePickupKm = useMemo(() => {
    if (pickupHint?.snappedKm !== null && pickupHint?.snappedKm !== undefined) {
      return pickupHint.snappedKm;
    }
    return Number.isNaN(parsedPickup) ? null : parsedPickup;
  }, [parsedPickup, pickupHint]);

  const effectiveDestKm = useMemo(() => {
    if (destHint?.snappedKm !== null && destHint?.snappedKm !== undefined) {
      return destHint.snappedKm;
    }
    return Number.isNaN(parsedDest) ? null : parsedDest;
  }, [destHint, parsedDest]);

  const isInputNumeric = effectivePickupKm !== null && effectiveDestKm !== null;
  const isWithinRouteRange = useMemo(() => {
    if (!isInputNumeric || effectivePickupKm === null || effectiveDestKm === null) return false;
    return (
      effectivePickupKm >= routeMinKm &&
      effectivePickupKm <= routeMaxKm &&
      effectiveDestKm >= routeMinKm &&
      effectiveDestKm <= routeMaxKm
    );
  }, [effectiveDestKm, effectivePickupKm, isInputNumeric, routeMaxKm, routeMinKm]);

  const distance = useMemo(() => {
    if (!isInputNumeric || effectivePickupKm === null || effectiveDestKm === null) return 0;
    return Math.abs(effectiveDestKm - effectivePickupKm);
  }, [effectiveDestKm, effectivePickupKm, isInputNumeric]);

  const formattedDistance = useMemo(() => {
    if (Number.isInteger(distance)) return distance.toString();
    return distance.toFixed(2).replace(/\.?0+$/, '');
  }, [distance]);

  const calculation = useMemo(
    () => calculateFare(distance, activeRoute.fare),
    [activeRoute.fare, distance]
  );

  const canSubmit = distance > 0 && isWithinRouteRange;
  const usesOfficialKmPostSnap = Boolean(
    (pickupHint && !pickupHint.exact && pickupHint.snappedKm !== null && pickupHint.snappedKm !== undefined) ||
    (destHint && !destHint.exact && destHint.snappedKm !== null && destHint.snappedKm !== undefined)
  );

  const applyNearestKmPost = (target: 'pickup' | 'dest') => {
    const hint = target === 'pickup' ? pickupHint : destHint;
    const setter = target === 'pickup' ? setPickup : setDest;
    if (!hint?.nearestStop || hint.snappedKm === null || hint.snappedKm === undefined) return;

    setter(formatEditableKm(hint.snappedKm));
    showToast(`Using official KM post ${hint.snappedKm} - ${hint.nearestStop.name}`);
  };

  const handleKeypadPress = (key: string) => {
    const isPickup = activeInput === 'pickup';
    const setter = isPickup ? setPickup : setDest;
    const current = isPickup ? pickup : dest;

    if (key === 'DEL') {
      setter(current.slice(0, -1));
      return;
    }

    if (key === '.') {
      if (!current.includes('.') && current.length < 6) setter(current + '.');
      return;
    }

    if (key === 'CLR') {
      setter('');
      return;
    }

    if (key === 'NEXT') {
      if (isPickup) {
        setActiveInput('dest');
        destRef.current?.focus();
      }
      return;
    }

    if (key === 'DONE') {
      pickupRef.current?.blur();
      destRef.current?.blur();
      return;
    }

    if (current.length < 6) {
      const nextValue = sanitizeKmInput(current + key);
      setter(nextValue);

      if (isPickup && nextValue.length >= 3) {
        window.setTimeout(() => {
          setActiveInput('dest');
          destRef.current?.focus();
        }, 100);
      }
    }
  };

  const handleOpenPunchType = () => {
    if (!canSubmit) return;

    if (usesOfficialKmPostSnap) {
      showToast('Using nearest official KM post for any entered KM without an exact tariff stop.', 'info');
    }

    setIsPunchTypeOpen(true);
  };

  const handleLog = (punchedFareType: 'regular' | 'discounted') => {
    if (!canSubmit) return;

    addRecord({
      origin: buildRecordLabel(pickup, pickupHint, 'Start'),
      destination: buildRecordLabel(dest, destHint, 'End'),
      distance,
      regularFare: calculation.reg,
      discountedFare: calculation.disc,
      punchedFareType,
      isFavorite
    });

    showToast(`${punchedFareType === 'discounted' ? 'Discounted' : 'Regular'} entry recorded`);
    setIsPunchTypeOpen(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex flex-col animate-fade-in bg-[#f8f6f6] dark:bg-black">
      <header
        className="shrink-0 border-b border-primary/10 bg-white px-4 pb-4 shadow-sm dark:bg-night-charcoal"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center px-2 py-1 font-bold text-primary transition-opacity active:opacity-50"
          >
            <span className="material-icons">close</span>
            <span className="ml-1 text-xs font-black uppercase tracking-widest">Cancel</span>
          </button>
          <h1 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Manual KM Entry
          </h1>
          <button
            onClick={() => {
              setUseCustomKeypad(!useCustomKeypad);
              setIsKeyboardVisible(false);
            }}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition-all ${
              useCustomKeypad
                ? 'bg-primary text-white shadow-md'
                : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300'
            }`}
          >
            <span className="material-icons text-sm">{useCustomKeypad ? 'apps' : 'keyboard_hide'}</span>
            <span className="text-[10px] font-black uppercase">{useCustomKeypad ? 'Pad ON' : 'Pad OFF'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto p-4 pb-10">
        <div className="mb-4 text-center">
          <span className="rounded-full border border-primary/10 bg-primary/5 px-4 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
            Editing: {activeInput === 'pickup' ? 'START KM' : 'END KM'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div
            onClick={() => {
              setActiveInput('pickup');
              pickupRef.current?.focus();
            }}
            className={`relative rounded-2xl border-2 bg-white p-4 transition-all dark:bg-night-charcoal ${
              activeInput === 'pickup'
                ? 'border-primary ring-2 ring-primary/10 shadow-md'
                : 'border-slate-200 opacity-80 dark:border-white/10'
            }`}
          >
            <label className="mb-1 block text-[9px] font-black uppercase text-primary">Start KM</label>
            <div className="flex items-center justify-between">
              <input
                ref={pickupRef}
                type="text"
                inputMode={useCustomKeypad ? 'none' : 'decimal'}
                placeholder="---"
                maxLength={6}
                className="w-full bg-transparent border-none p-0 text-3xl font-black placeholder-slate-300 focus:ring-0 dark:placeholder-slate-700"
                value={pickup}
                onFocus={() => {
                  setActiveInput('pickup');
                  if (!useCustomKeypad) setIsKeyboardVisible(true);
                }}
                onBlur={() => setIsKeyboardVisible(false)}
                onChange={(event) => {
                  const nextValue = sanitizeKmInput(event.target.value);
                  setPickup(nextValue);
                  if (nextValue.length >= 3) {
                    setActiveInput('dest');
                    destRef.current?.focus();
                  }
                }}
              />
              {pickup && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setPickup('');
                  }}
                  className="material-icons text-lg text-slate-400"
                >
                  cancel
                </button>
              )}
            </div>
            {pickupHint && (
              <div
                className={`mt-3 rounded-xl px-3 py-2 ${
                  pickupHint.tone === 'exact'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : pickupHint.tone === 'warning'
                      ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-200'
                      : 'bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-200'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-wide">{pickupHint.title}</p>
                {pickupHint.detail && (
                  <p className="mt-1 text-[10px] font-semibold leading-snug opacity-80">{pickupHint.detail}</p>
                )}
                {!pickupHint.exact && pickupHint.nearestStop && pickupHint.snappedKm !== null && pickupHint.snappedKm !== undefined && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      applyNearestKmPost('pickup');
                    }}
                    className="mt-2 rounded-full bg-primary/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary active:scale-95"
                  >
                    Use KM {formatEditableKm(pickupHint.snappedKm)} - {pickupHint.nearestStop.name}
                  </button>
                )}
              </div>
            )}
          </div>

          <div
            onClick={() => {
              setActiveInput('dest');
              destRef.current?.focus();
            }}
            className={`relative rounded-2xl border-2 bg-white p-4 transition-all dark:bg-night-charcoal ${
              activeInput === 'dest'
                ? 'border-primary ring-2 ring-primary/10 shadow-md'
                : 'border-slate-200 opacity-80 dark:border-white/10'
            }`}
          >
            <label className="mb-1 block text-[9px] font-black uppercase text-primary">End KM</label>
            <div className="flex items-center justify-between">
              <input
                ref={destRef}
                type="text"
                inputMode={useCustomKeypad ? 'none' : 'decimal'}
                placeholder="---"
                maxLength={6}
                className="w-full bg-transparent border-none p-0 text-3xl font-black placeholder-slate-300 focus:ring-0 dark:placeholder-slate-700"
                value={dest}
                onFocus={() => {
                  setActiveInput('dest');
                  if (!useCustomKeypad) setIsKeyboardVisible(true);
                }}
                onBlur={() => setIsKeyboardVisible(false)}
                onChange={(event) => setDest(sanitizeKmInput(event.target.value))}
              />
              {dest && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setDest('');
                  }}
                  className="material-icons text-lg text-slate-400"
                >
                  cancel
                </button>
              )}
            </div>
            {destHint && (
              <div
                className={`mt-3 rounded-xl px-3 py-2 ${
                  destHint.tone === 'exact'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : destHint.tone === 'warning'
                      ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-200'
                      : 'bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-200'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-wide">{destHint.title}</p>
                {destHint.detail && (
                  <p className="mt-1 text-[10px] font-semibold leading-snug opacity-80">{destHint.detail}</p>
                )}
                {!destHint.exact && destHint.nearestStop && destHint.snappedKm !== null && destHint.snappedKm !== undefined && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      applyNearestKmPost('dest');
                    }}
                    className="mt-2 rounded-full bg-primary/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary active:scale-95"
                  >
                    Use KM {formatEditableKm(destHint.snappedKm)} - {destHint.nearestStop.name}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2.5rem] border-t-8 border-primary bg-zinc-900 p-7 text-white shadow-2xl">
          <div className="pointer-events-none absolute right-0 top-0 p-4 opacity-5">
            <span className="material-icons text-8xl">explore</span>
          </div>
          <div className="mb-6 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Calculated Route</span>
          </div>
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="text-4xl font-900 leading-none">{formattedDistance} km</p>
              <p className="mt-2 text-[10px] font-black uppercase text-white/60">Total Kilometers</p>
            </div>
            <button
              onClick={() => {
                const temp = pickup;
                setPickup(dest);
                setDest(temp);
              }}
              className="rounded-2xl border border-white/20 bg-primary p-4 text-white shadow-lg transition-transform active:scale-90"
            >
              <span className="material-icons text-2xl">swap_horiz</span>
            </button>
          </div>

          {usesOfficialKmPostSnap && (
            <div className="mb-5 rounded-[1.25rem] border border-primary/20 bg-primary/10 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Using Official KM Posts</p>
              <p className="mt-1 text-sm font-semibold text-white/85">
                Start uses KM {effectivePickupKm !== null ? formatEditableKm(effectivePickupKm) : '--'} and end uses KM{' '}
                {effectiveDestKm !== null ? formatEditableKm(effectiveDestKm) : '--'} because the entered KM does not match an exact tariff stop.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 divide-x divide-white/20">
            <div className="pr-2">
              <p className="mb-1 text-[10px] font-black uppercase text-primary">Regular</p>
              <p className="text-4xl font-black text-white">{peso}{calculation.reg}</p>
            </div>
            <div className="pl-6">
              <p className="mb-1 text-[10px] font-black uppercase text-green-400">Discount</p>
              <p className="text-4xl font-black text-white">{peso}{calculation.disc}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-night-charcoal">
          <div className="flex items-center gap-3">
            <span
              className={`material-icons text-2xl transition-colors ${
                isFavorite ? 'text-primary' : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              star
            </span>
            <span className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Save as Favorite
            </span>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={event => setIsFavorite(event.target.checked)}
              className="peer sr-only"
            />
            <div className="h-7 w-12 rounded-full bg-slate-200 after:absolute after:left-[4px] after:top-[4px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full dark:bg-slate-700" />
          </label>
        </div>

        {!isInputNumeric && (pickup !== '' || dest !== '') && (
          <p className="text-center text-[10px] font-black uppercase tracking-wide text-red-500">
            Enter valid numeric KM values
          </p>
        )}
        {isInputNumeric && !isWithinRouteRange && (
          <p className="text-center text-[10px] font-black uppercase tracking-wide text-red-500">
            KM must be within route range ({routeMinKm} to {routeMaxKm})
          </p>
        )}

        <button
          onClick={handleOpenPunchType}
          disabled={!canSubmit}
          className="mb-4 w-full rounded-3xl bg-primary py-6 text-sm font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 disabled:bg-slate-300 dark:disabled:bg-white/10"
        >
          {isFavorite ? 'Confirm & Save Favorite' : 'Record Distance Entry'}
        </button>
      </main>

      {isPunchTypeOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          onClick={() => setIsPunchTypeOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl dark:bg-night-charcoal"
            onClick={event => event.stopPropagation()}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Punched Fare</p>
            <h3 className="mt-2 text-xl font-900 text-slate-900 dark:text-white">Which fare was punched?</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-300">
              The selected fare will be shown as the main amount in History Logs.
            </p>
            {usesOfficialKmPostSnap && (
              <p className="mt-2 text-xs font-semibold text-primary">
                This entry uses the nearest official KM posts where no exact tariff stop exists.
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => handleLog('regular')}
                className="rounded-[1.5rem] border border-primary/15 bg-primary/5 px-4 py-4 text-left transition-all active:scale-[0.98]"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Regular</p>
                <p className="mt-2 text-3xl font-900 text-primary">{peso}{calculation.reg}</p>
              </button>

              <button
                onClick={() => handleLog('discounted')}
                className="rounded-[1.5rem] border border-emerald-500/15 bg-emerald-500/5 px-4 py-4 text-left transition-all active:scale-[0.98]"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">Discounted</p>
                <p className="mt-2 text-3xl font-900 text-emerald-600 dark:text-emerald-300">{peso}{calculation.disc}</p>
              </button>
            </div>

            <button
              onClick={() => setIsPunchTypeOpen(false)}
              className="mt-4 w-full rounded-[1.25rem] bg-slate-100 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all active:scale-[0.98] dark:bg-white/10 dark:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {useCustomKeypad && !isKeyboardVisible && (
        <div className="grid shrink-0 grid-cols-4 gap-2 border-t border-slate-200 bg-white p-3 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(0,0,0,0.1)] dark:border-white/10 dark:bg-night-charcoal">
          {[
            '1', '2', '3', 'DEL',
            '4', '5', '6', 'NEXT',
            '7', '8', '9', 'CLR',
            '.', '0', '00', 'DONE'
          ].map(key => (
            <button
              key={key}
              onClick={() => handleKeypadPress(key)}
              className={`h-14 rounded-xl text-xl font-black transition-all active:scale-90 ${
                ['DEL', 'NEXT', 'CLR', 'DONE'].includes(key)
                  ? 'bg-primary/10 text-[10px] text-primary active:bg-primary active:text-white'
                  : 'border border-slate-200 bg-slate-100 shadow-sm dark:border-white/5 dark:bg-white/10 dark:text-white'
              }`}
            >
              {key === 'DEL' ? <span className="material-icons text-base">backspace</span> : key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ManualKMOverlay;
