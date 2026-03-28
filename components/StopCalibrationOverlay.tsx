import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  collectLocationSamples,
  formatMeters,
  getLocationErrorMessage
} from '../utils/location';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const StopCalibrationOverlay: React.FC<Props> = ({ isOpen, onClose }) => {
  const { activeRoute, addStopSubmission, showToast, stopSyncState, syncStopSubmissions } = useApp();
  const [search, setSearch] = useState('');
  const [selectedStopName, setSelectedStopName] = useState('');
  const [capturedLocation, setCapturedLocation] = useState<Awaited<ReturnType<typeof collectLocationSamples>> | null>(null);
  const [radiusInput, setRadiusInput] = useState('60');
  const [notes, setNotes] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const defaultStop = activeRoute.stops.find(stop => stop.isTerminal) ?? activeRoute.stops[0];
    setSearch('');
    setSelectedStopName(defaultStop?.name ?? '');
    setCapturedLocation(null);
    setRadiusInput(String(defaultStop?.radiusMeters ?? 60));
    setNotes('');
    setCaptureError(null);
  }, [activeRoute.id, activeRoute.stops, isOpen]);

  const selectedStop = useMemo(
    () => activeRoute.stops.find(stop => stop.name === selectedStopName) ?? activeRoute.stops[0],
    [activeRoute.stops, selectedStopName]
  );

  const filteredStops = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    if (!searchText) {
      return activeRoute.stops;
    }

    return activeRoute.stops.filter(stop =>
      stop.name.toLowerCase().includes(searchText) ||
      stop.aliases?.some(alias => alias.toLowerCase().includes(searchText))
    );
  }, [activeRoute.stops, search]);

  if (!isOpen) return null;

  const handleCapture = async () => {
    setIsCapturing(true);
    setCaptureError(null);

    try {
      const snapshot = await collectLocationSamples({
        sampleWindowMs: 7000,
        maxSamples: 4,
        enableHighAccuracy: true
      });

      setCapturedLocation(snapshot);
      setRadiusInput(String(Math.max(selectedStop?.radiusMeters ?? 60, Math.min(180, Math.round(snapshot.accuracy + 20)))));
      showToast('Phone GPS captured for this stop', 'info');
    } catch (error) {
      const message = getLocationErrorMessage(
        error instanceof Error ? error : new Error('Unable to capture GPS.'),
        'unknown',
        false
      );
      setCaptureError(message);
      showToast('Unable to capture stop location', 'info');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSave = async () => {
    if (!selectedStop || !capturedLocation) {
      return;
    }

    addStopSubmission({
      stopName: selectedStop.name,
      latitude: capturedLocation.latitude,
      longitude: capturedLocation.longitude,
      accuracyMeters: capturedLocation.accuracy,
      radiusMeters: Math.max(35, parseInt(radiusInput, 10) || selectedStop.radiusMeters || 60),
      sampleCount: capturedLocation.sampleCount ?? 1,
      source: capturedLocation.source === 'native' ? 'native' : 'browser',
      notes: notes.trim() || undefined
    });

    setCapturedLocation(null);
    setNotes('');
    showToast(`${selectedStop.name} saved for stop learning`);

    if (stopSyncState.enabled && navigator.onLine) {
      await syncStopSubmissions();
    }
  };

  return (
    <div className="fixed inset-0 z-[160] bg-white dark:bg-black flex flex-col animate-fade-in">
      <header
        className="px-4 pb-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <button onClick={onClose} className="p-2 -ml-2 active:opacity-50 transition-opacity">
          <span className="material-icons text-slate-600 dark:text-white">chevron_left</span>
        </button>
        <div className="text-center">
          <h1 className="text-sm font-900 tracking-widest uppercase text-slate-800 dark:text-white">Stop Calibration</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">{activeRoute.shortLabel}</p>
        </div>
        <div className="w-10" />
      </header>

      <div className="p-4 bg-slate-50 dark:bg-night-charcoal border-b border-slate-100 dark:border-white/5">
        <div className="relative">
          <span className="material-icons absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-black border-2 border-slate-100 dark:border-white/10 rounded-2xl outline-none focus:border-primary transition-colors font-bold text-slate-800 dark:text-white"
            placeholder="Search stop to calibrate..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-black/30">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Shared Sync</p>
            <p className="mt-1 text-sm font-black text-slate-800 dark:text-white">
              {stopSyncState.enabled ? 'Supabase Ready' : 'Local Device Only'}
            </p>
          </div>
          {stopSyncState.enabled && (
            <button
              onClick={() => void syncStopSubmissions()}
              className="rounded-2xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
            >
              {stopSyncState.isSyncing ? 'Syncing' : 'Sync Now'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="rounded-[2rem] bg-white p-4 shadow-sm dark:bg-night-charcoal">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Choose Stop</p>
          <div className="mt-3 grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
            {filteredStops.map(stop => {
              const isSelected = selectedStop?.name === stop.name;
              return (
                <button
                  key={`${stop.km}-${stop.name}`}
                  onClick={() => {
                    setSelectedStopName(stop.name);
                    setCapturedLocation(null);
                    setRadiusInput(String(stop.radiusMeters ?? 60));
                    setCaptureError(null);
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 text-slate-900 dark:text-white'
                      : 'border-slate-100 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">{stop.name}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        KM {stop.km} • {stop.calibrationSamples ?? 0} learned samples
                      </p>
                    </div>
                    {isSelected && (
                      <span className="material-icons text-primary">check_circle</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedStop && (
          <div className="rounded-[2rem] bg-white p-5 shadow-sm dark:bg-night-charcoal">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Selected Stop</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{selectedStop.name}</h2>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400">
              KM {selectedStop.km} • Radius {selectedStop.radiusMeters ?? 60}m
            </p>
            {selectedStop.latitude && selectedStop.longitude && (
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                Current mapped point: {selectedStop.latitude.toFixed(6)}, {selectedStop.longitude.toFixed(6)}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => void handleCapture()}
                disabled={isCapturing}
                className="rounded-[1.5rem] bg-primary py-4 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 disabled:opacity-60"
              >
                {isCapturing ? 'Capturing GPS...' : 'Capture Current Location'}
              </button>
              <input
                type="number"
                min="35"
                max="180"
                value={radiusInput}
                onChange={event => setRadiusInput(event.target.value)}
                className="rounded-[1.5rem] border border-slate-200 bg-white px-4 text-center text-sm font-black text-slate-700 outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white"
                placeholder="Radius (m)"
              />
            </div>

            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={3}
              className="mt-4 w-full rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white"
              placeholder="Optional notes like roadside marker or landmark..."
            />

            {captureError && (
              <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10">
                <p className="text-xs font-bold text-red-600 dark:text-red-200">{captureError}</p>
              </div>
            )}

            {capturedLocation && (
              <div className="mt-4 rounded-[1.5rem] bg-slate-50 px-4 py-4 dark:bg-black/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Captured GPS</p>
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                  {capturedLocation.latitude.toFixed(6)}, {capturedLocation.longitude.toFixed(6)}
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                  Accuracy {formatMeters(capturedLocation.accuracy)} • {capturedLocation.sampleCount ?? 1} samples • {capturedLocation.source === 'native' ? 'Phone GPS' : 'Browser GPS'}
                </p>
                <button
                  onClick={() => void handleSave()}
                  className="mt-4 w-full rounded-[1.5rem] bg-slate-900 py-4 text-[10px] font-black uppercase tracking-widest text-white active:scale-95 dark:bg-white dark:text-slate-900"
                >
                  Save Stop Calibration
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StopCalibrationOverlay;
