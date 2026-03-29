import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import HelpHint from './HelpHint';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) {
    return undefined;
  }

  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : undefined;
};

const formatFieldNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

const RouteAdminOverlay: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    activeRoute,
    routeLandmarks,
    routeSegments,
    verifiedStops,
    routeOverrides,
    saveRouteFareOverride,
    saveStopOverride,
    resetRouteOverrides,
    showToast
  } = useApp();
  const [selectedStopName, setSelectedStopName] = useState('');
  const [regularRate, setRegularRate] = useState('');
  const [discountRate, setDiscountRate] = useState('');
  const [minimumRegularFare, setMinimumRegularFare] = useState('');
  const [minimumDiscountFare, setMinimumDiscountFare] = useState('');
  const [minimumDistanceKm, setMinimumDistanceKm] = useState('');
  const [stopKm, setStopKm] = useState('');
  const [stopLatitude, setStopLatitude] = useState('');
  const [stopLongitude, setStopLongitude] = useState('');
  const [stopRadius, setStopRadius] = useState('');
  const [googleMapsQuery, setGoogleMapsQuery] = useState('');
  const [aliasText, setAliasText] = useState('');

  const currentRouteOverride = routeOverrides[activeRoute.id];
  const selectedStop = useMemo(
    () => activeRoute.stops.find(stop => stop.name === selectedStopName) ?? activeRoute.stops[0] ?? null,
    [activeRoute.stops, selectedStopName]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedStopName(current => current || activeRoute.stops[0]?.name || '');
    setRegularRate(formatFieldNumber(activeRoute.fare.regularRate));
    setDiscountRate(formatFieldNumber(activeRoute.fare.discountRate));
    setMinimumRegularFare(formatFieldNumber(activeRoute.fare.minimumRegularFare));
    setMinimumDiscountFare(formatFieldNumber(activeRoute.fare.minimumDiscountFare));
    setMinimumDistanceKm(formatFieldNumber(activeRoute.fare.minimumDistanceKm));
  }, [activeRoute.fare.discountRate, activeRoute.fare.minimumDiscountFare, activeRoute.fare.minimumDistanceKm, activeRoute.fare.minimumRegularFare, activeRoute.fare.regularRate, activeRoute.stops, isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedStop) {
      return;
    }

    setStopKm(formatFieldNumber(selectedStop.km));
    setStopLatitude(formatFieldNumber(selectedStop.latitude));
    setStopLongitude(formatFieldNumber(selectedStop.longitude));
    setStopRadius(formatFieldNumber(selectedStop.radiusMeters));
    setGoogleMapsQuery(selectedStop.googleMapsQuery ?? '');
    setAliasText((selectedStop.aliases ?? []).join(', '));
  }, [isOpen, selectedStop]);

  if (!isOpen) {
    return null;
  }

  const handleSaveFare = () => {
    saveRouteFareOverride(activeRoute.id, {
      regularRate: parseOptionalNumber(regularRate),
      discountRate: parseOptionalNumber(discountRate),
      minimumRegularFare: parseOptionalNumber(minimumRegularFare) ?? null,
      minimumDiscountFare: parseOptionalNumber(minimumDiscountFare) ?? null,
      minimumDistanceKm: parseOptionalNumber(minimumDistanceKm) ?? null
    });
    showToast('Fare editor saved for this route');
  };

  const handleSaveStop = () => {
    if (!selectedStop) {
      showToast('Choose a stop first.', 'info');
      return;
    }

    saveStopOverride(activeRoute.id, selectedStop.name, {
      km: parseOptionalNumber(stopKm),
      latitude: parseOptionalNumber(stopLatitude),
      longitude: parseOptionalNumber(stopLongitude),
      radiusMeters: parseOptionalNumber(stopRadius),
      googleMapsQuery: googleMapsQuery.trim() || undefined,
      aliases: aliasText
        .split(',')
        .map(alias => alias.trim())
        .filter(Boolean)
    });
    showToast(`Saved ${selectedStop.name} override`);
  };

  const handleResetRoute = () => {
    resetRouteOverrides(activeRoute.id);
    showToast('Route editor reset for this device');
  };

  return (
    <div className="fixed inset-0 z-[175] flex flex-col bg-white/95 backdrop-blur-md dark:bg-black/95 animate-fade-in">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative mt-auto flex max-h-[95svh] min-h-0 flex-col overflow-hidden rounded-t-[2.5rem] bg-white shadow-2xl dark:bg-night-charcoal">
        <header
          className="flex items-center justify-between border-b border-slate-100 px-5 pb-4 dark:border-white/10"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Route Editor</p>
            <h2 className="mt-1 text-lg font-900 text-slate-900 dark:text-white">{activeRoute.label}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 shadow-sm dark:bg-white/10 dark:text-white"
          >
            <span className="material-icons text-lg">close</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center dark:bg-black/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Landmarks</p>
                <p className="mt-2 text-xl font-900 text-slate-900 dark:text-white">{routeLandmarks.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center dark:bg-black/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Segments</p>
                <p className="mt-2 text-xl font-900 text-slate-900 dark:text-white">{routeSegments.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center dark:bg-black/30">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Verified</p>
                <p className="mt-2 text-xl font-900 text-slate-900 dark:text-white">{verifiedStops.length}</p>
              </div>
            </div>

            <section className="rounded-[2rem] border border-slate-100 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/30">
              <div className="flex items-center gap-2">
                <HelpHint
                  label="Use this to adjust fare rules for the current route on this device. These overrides apply after the built-in route data."
                  triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
                >
                  Fare Rules
                </HelpHint>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Regular Rate</span>
                  <input value={regularRate} onChange={event => setRegularRate(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Discount Rate</span>
                  <input value={discountRate} onChange={event => setDiscountRate(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Minimum Regular</span>
                  <input value={minimumRegularFare} onChange={event => setMinimumRegularFare(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Minimum Discount</span>
                  <input value={minimumDiscountFare} onChange={event => setMinimumDiscountFare(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
                </label>
                <label className="col-span-2 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Minimum Distance KM</span>
                  <input value={minimumDistanceKm} onChange={event => setMinimumDistanceKm(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
                </label>
              </div>
              <button
                onClick={handleSaveFare}
                className="mt-4 w-full rounded-2xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-[0.98]"
              >
                Save Fare Override
              </button>
            </section>

            <section className="rounded-[2rem] border border-slate-100 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/30">
              <div className="flex items-center gap-2">
                <HelpHint
                  label="Edit the exact KM, GPS point, radius, and search query for a route stop. These local admin values override weaker learned geometry on this device."
                  triggerClassName="inline-flex cursor-pointer rounded-md text-[10px] font-black uppercase tracking-widest text-slate-400"
                >
                  Stop Geometry
                </HelpHint>
              </div>

              <label className="mt-4 block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stop</span>
                <select
                  value={selectedStopName}
                  onChange={event => setSelectedStopName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white"
                >
                  {activeRoute.stops.map(stop => (
                    <option key={stop.name} value={stop.name}>
                      {stop.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">KM</span>
                  <input value={stopKm} onChange={event => setStopKm(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Radius Meters</span>
                  <input value={stopRadius} onChange={event => setStopRadius(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Latitude</span>
                  <input value={stopLatitude} onChange={event => setStopLatitude(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Longitude</span>
                  <input value={stopLongitude} onChange={event => setStopLongitude(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
                </label>
              </div>

              <label className="mt-3 block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Google Maps Query</span>
                <input value={googleMapsQuery} onChange={event => setGoogleMapsQuery(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
              </label>

              <label className="mt-3 block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aliases</span>
                <input value={aliasText} onChange={event => setAliasText(event.target.value)} placeholder="Comma separated names" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white" />
              </label>

              <button
                onClick={handleSaveStop}
                className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-[0.98] dark:bg-white dark:text-slate-900"
              >
                Save Stop Override
              </button>
            </section>

            <button
              onClick={handleResetRoute}
              disabled={!currentRouteOverride}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-[0.98] disabled:opacity-50 dark:border-white/10 dark:text-slate-300"
            >
              Reset This Route Editor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteAdminOverlay;
