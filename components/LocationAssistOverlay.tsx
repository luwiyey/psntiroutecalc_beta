import React from 'react';
import type { Stop } from '../types';
import type {
  CurrentLocationSnapshot,
  LocationPermissionState,
  SegmentMatch,
  StopMatch
} from '../utils/location';
import { formatMeters } from '../utils/location';
import { formatRouteEndpointSummary } from '../utils/route-distance';

interface Props {
  isOpen: boolean;
  isLoading: boolean;
  routeLabel: string;
  routeStartName: string;
  routeEndName: string;
  routeStartKm: number;
  routeEndKm: number;
  location: CurrentLocationSnapshot | null;
  nearestMatch: StopMatch | null;
  segmentMatch: SegmentMatch | null;
  hasMappedStops: boolean;
  permissionState: LocationPermissionState;
  inAppBrowser: boolean;
  error: string | null;
  onClose: () => void;
  onOpenInChrome: () => void;
  onRetry: () => void;
  onUseStop: (stop: Stop) => void;
  onUseManualKm: (pickupKm: number) => void;
}

const formatCoordinate = (value: number) => value.toFixed(6);
const formatKm = (value: number) => value.toFixed(2).replace(/\.?0+$/, '');

const LocationAssistOverlay: React.FC<Props> = ({
  isOpen,
  isLoading,
  routeLabel,
  routeStartName,
  routeEndName,
  routeStartKm,
  routeEndKm,
  location,
  nearestMatch,
  segmentMatch,
  hasMappedStops,
  permissionState,
  inAppBrowser,
  error,
  onClose,
  onOpenInChrome,
  onRetry,
  onUseStop,
  onUseManualKm
}) => {
  if (!isOpen) return null;

  const shouldOfferManualKm = Boolean(
    segmentMatch &&
      (
        nearestMatch === null ||
        (segmentMatch.progressRatio > 0.08 && segmentMatch.progressRatio < 0.92) ||
        Math.abs(segmentMatch.estimatedKm - nearestMatch.stop.km) >= 0.1 ||
        nearestMatch.distanceMeters > 200
      )
  );

  const segmentEndpointSummary = segmentMatch
    ? formatRouteEndpointSummary(segmentMatch.estimatedKm, routeStartKm, routeEndKm, routeStartName, routeEndName)
    : null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[92vh] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-fade-in dark:bg-night-charcoal">
        <div
          className="shrink-0 flex items-center justify-between px-5 pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
              <span className="material-icons text-lg">my_location</span>
            </div>
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">GPS Pickup Assist</h2>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{routeLabel}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 active:scale-90 dark:bg-white/10"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 visible-scrollbar">
          <div className="space-y-4">
            <div className="rounded-[2rem] bg-[#0f172a] p-5 text-white shadow-inner dark:bg-black">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Current Location</p>
              {isLoading ? (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-white" />
                  <p className="text-sm font-black uppercase tracking-widest text-white/80">Reading GPS...</p>
                </div>
              ) : location ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-white/5 px-4 py-3">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Latitude</p>
                    <p className="mt-2 text-xl font-900">{formatCoordinate(location.latitude)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 px-4 py-3">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Longitude</p>
                    <p className="mt-2 text-xl font-900">{formatCoordinate(location.longitude)}</p>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Accuracy</p>
                      <p className="mt-2 text-xl font-900">{formatMeters(location.accuracy)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Updated</p>
                      <p className="mt-2 text-xs font-black text-white/80">
                        {new Date(location.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm font-black uppercase tracking-widest text-white/70">Tap retry to request location.</p>
              )}
            </div>

            {error && (
              <div className="rounded-[2rem] border border-red-200 bg-red-50 px-5 py-4 dark:border-red-500/20 dark:bg-red-500/10">
                <p className="text-[9px] font-black uppercase tracking-widest text-red-500">Location Error</p>
                <p className="mt-2 text-sm font-bold text-red-600 dark:text-red-300">{error}</p>
              </div>
            )}

            {(inAppBrowser || permissionState === 'denied' || permissionState === 'prompt') && (
              <div className="rounded-[2rem] border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-night-charcoal">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary">Browser Check</p>
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                  {permissionState === 'denied'
                    ? 'Location is blocked for this browser or site.'
                    : permissionState === 'prompt'
                      ? 'This browser should ask for location permission when GPS is requested.'
                      : 'Some in-app browsers do not return GPS reliably even when phone location is on.'}
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                  {inAppBrowser
                    ? 'If you opened this from Messenger or Facebook, use Open in Browser or Chrome for better GPS access.'
                    : 'If no popup appears, check the browser app permission in your phone settings.'}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={onRetry}
                    className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  >
                    Retry
                  </button>
                  <button
                    onClick={onOpenInChrome}
                    className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                  >
                    Open in Chrome
                  </button>
                </div>
              </div>
            )}

            {!isLoading && !error && location && nearestMatch && (
              <div className="rounded-[2rem] border border-primary/10 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-night-charcoal">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary">Nearest Mapped Stop</p>
                <h3 className="mt-2 text-2xl font-900 text-slate-900 dark:text-white">{nearestMatch.stop.name}</h3>
                <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                  KM {nearestMatch.stop.km} • {formatMeters(nearestMatch.distanceMeters)} away
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                  {formatRouteEndpointSummary(nearestMatch.stop.km, routeStartKm, routeEndKm, routeStartName, routeEndName)}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onUseStop(nearestMatch.stop)}
                    className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                  >
                    Use Stop
                  </button>
                  <button
                    onClick={onRetry}
                    className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  >
                    Retry
                  </button>
                </div>

                {shouldOfferManualKm && segmentMatch && (
                  <div className="mt-4 rounded-[1.5rem] bg-slate-50 px-4 py-4 dark:bg-white/5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary">Between Stops</p>
                    <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                      GPS looks near KM {formatKm(segmentMatch.estimatedKm)}, between {segmentMatch.startStop.name} and{' '}
                      {segmentMatch.endStop.name}.
                    </p>
                    <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">{segmentEndpointSummary}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                      Use Manual KM if the pickup was not at an exact tariff stop.
                    </p>
                    <button
                      onClick={() => onUseManualKm(segmentMatch.estimatedKm)}
                      className="mt-4 w-full rounded-[1.5rem] bg-slate-900 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 dark:bg-white dark:text-slate-900"
                    >
                      Use Manual KM
                    </button>
                  </div>
                )}
              </div>
            )}

            {!isLoading && !error && location && !nearestMatch && segmentMatch && (
              <div className="rounded-[2rem] border border-primary/10 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-night-charcoal">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary">Between Stops</p>
                <h3 className="mt-2 text-2xl font-900 text-slate-900 dark:text-white">KM {formatKm(segmentMatch.estimatedKm)}</h3>
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                  Between {segmentMatch.startStop.name} and {segmentMatch.endStop.name}
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">{segmentEndpointSummary}</p>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                  Stop picker only supports exact tariff stops. Manual KM is better for this pickup.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onUseManualKm(segmentMatch.estimatedKm)}
                    className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                  >
                    Use Manual KM
                  </button>
                  <button
                    onClick={onRetry}
                    className="rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {!isLoading && !error && location && !nearestMatch && !segmentMatch && (
              <div className="rounded-[2rem] border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-night-charcoal">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary">Stop Match</p>
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                  {hasMappedStops
                    ? 'No mapped stop was close enough to use safely. You can retry or choose the pickup manually.'
                    : 'This route does not have GPS stop coordinates yet, so the app cannot auto-pick a stop safely. Manual stop selection stays available.'}
                </p>
                <button
                  onClick={onRetry}
                  className="mt-4 w-full rounded-[1.5rem] border border-slate-200 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  Retry Location
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationAssistOverlay;
