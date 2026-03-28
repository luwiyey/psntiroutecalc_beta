import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import {
  buildGoogleMapsPointUrl,
  openGoogleMapsUrl
} from '../utils/google-maps';
import {
  hasGoogleMapsAssistConfig,
  searchGooglePlaceCandidates,
  type GooglePlaceCandidate
} from '../utils/google-maps-assist';

export interface MapPickerPoint {
  latitude: number;
  longitude: number;
  placeId?: string | null;
  label?: string | null;
  source?: 'manual' | 'gps' | 'google-place';
}

interface Props {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  initialPoint: MapPickerPoint;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (point: MapPickerPoint) => void;
}

type LeafletModule = typeof import('leaflet');

const MapPickerOverlay: React.FC<Props> = ({
  isOpen,
  title,
  subtitle,
  initialPoint,
  confirmLabel = 'Use Selected Point',
  onClose,
  onConfirm
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<MapPickerPoint>(initialPoint);
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<GooglePlaceCandidate[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    setSelectedPoint(initialPoint);
    setSearch(initialPoint.label ?? '');
    setSearchError(null);
    setSearchResults([]);
  }, [initialPoint, isOpen]);

  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return undefined;

    let cancelled = false;

    const setupMap = async () => {
      const L: LeafletModule = await import('leaflet');
      if (cancelled || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true
      }).setView([selectedPoint.latitude, selectedPoint.longitude], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const icon = L.divIcon({
        className: 'psnti-map-picker-icon',
        html: '<span class="psnti-map-picker-pin"></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      });

      const marker = L.marker([selectedPoint.latitude, selectedPoint.longitude], {
        draggable: true,
        icon
      }).addTo(map);

      marker.on('dragend', () => {
        const latLng = marker.getLatLng();
        setSelectedPoint({
          latitude: latLng.lat,
          longitude: latLng.lng,
          source: 'manual'
        });
      });

      map.on('click', event => {
        marker.setLatLng(event.latlng);
        setSelectedPoint({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
          source: 'manual'
        });
      });

      window.setTimeout(() => map.invalidateSize(), 0);
      mapRef.current = map;
      markerRef.current = marker;
    };

    void setupMap();

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !mapRef.current || !markerRef.current) return;

    const nextLatLng: [number, number] = [selectedPoint.latitude, selectedPoint.longitude];
    markerRef.current.setLatLng(nextLatLng);
    mapRef.current.setView(nextLatLng, mapRef.current.getZoom() || 16, { animate: false });
  }, [isOpen, selectedPoint.latitude, selectedPoint.longitude]);

  const handlePlaceSearch = async () => {
    const trimmedQuery = search.trim();
    if (!trimmedQuery) {
      setSearchError('Type a place name first.');
      setSearchResults([]);
      return;
    }

    if (!hasGoogleMapsAssistConfig()) {
      setSearchError('Google place search is not configured yet.');
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const places = await searchGooglePlaceCandidates(trimmedQuery);
      setSearchResults(places);
      if (places.length === 0) {
        setSearchError('No close Google place matches were found for that search.');
      }
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : 'Unable to search Google places right now.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (place: GooglePlaceCandidate) => {
    setSelectedPoint({
      latitude: place.latitude,
      longitude: place.longitude,
      placeId: place.placeId,
      label: place.name,
      source: 'google-place'
    });
    setSearch(place.name);
    setSearchResults([]);
    setSearchError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-night-charcoal">
        <div
          className="flex items-center justify-between border-b border-slate-100 px-5 pb-4 dark:border-white/10"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}
        >
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-[0.24em] text-primary">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 active:scale-95 dark:bg-white/10"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 visible-scrollbar">
          <div className="rounded-[1.5rem] bg-slate-50 p-4 dark:bg-black/30">
            <label className="text-[9px] font-black uppercase tracking-widest text-primary">
              Search With Google Places
            </label>
            <div className="mt-3 flex gap-2">
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handlePlaceSearch();
                  }
                }}
                className="min-w-0 flex-1 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-primary dark:border-white/10 dark:bg-black dark:text-white"
                placeholder="Search terminal, landmark, or stop"
              />
              <button
                type="button"
                onClick={() => void handlePlaceSearch()}
                className="rounded-[1.25rem] bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
              >
                {isSearching ? 'Finding' : 'Find'}
              </button>
            </div>
            {searchError && (
              <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-200">{searchError}</p>
            )}
            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {searchResults.map(place => (
                  <button
                    key={place.placeId}
                    type="button"
                    onClick={() => handleSelectSearchResult(place)}
                    className="w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-left shadow-sm active:scale-[0.99] dark:border-white/10 dark:bg-black/40"
                  >
                    <p className="text-sm font-black text-slate-800 dark:text-white">{place.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-300">{place.formattedAddress}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 shadow-sm dark:border-white/10">
            <div ref={mapContainerRef} className="h-[320px] w-full bg-slate-200 dark:bg-black" />
          </div>

          <div className="rounded-[1.5rem] bg-slate-50 p-4 dark:bg-black/30">
            <p className="text-[9px] font-black uppercase tracking-widest text-primary">Selected Point</p>
            <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">
              {selectedPoint.latitude.toFixed(6)}, {selectedPoint.longitude.toFixed(6)}
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
              {selectedPoint.label
                ? `${selectedPoint.label} • ${selectedPoint.source === 'google-place' ? 'Google place' : 'Manual point'}`
                : 'Tap the map or drag the pin to choose the exact point.'}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  openGoogleMapsUrl(
                    buildGoogleMapsPointUrl(
                      selectedPoint.latitude,
                      selectedPoint.longitude,
                      selectedPoint.placeId
                    )
                  )
                }
                className="rounded-[1.5rem] border border-primary/20 bg-primary/5 py-3 text-[10px] font-black uppercase tracking-widest text-primary active:scale-95"
              >
                Open In Maps
              </button>
              <button
                type="button"
                onClick={() => onConfirm(selectedPoint)}
                className="rounded-[1.5rem] bg-primary py-3 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapPickerOverlay;
