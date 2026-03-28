import { Capacitor } from '@capacitor/core';
import type { Stop } from '../types';

export interface CurrentLocationSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  source?: 'native' | 'browser';
  sampleCount?: number;
}

export interface StopMatch {
  stop: Stop;
  distanceMeters: number;
}

export interface SegmentMatch {
  startStop: Stop;
  endStop: Stop;
  distanceMeters: number;
  estimatedKm: number;
  progressRatio: number;
}

export type LocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown';

const EARTH_RADIUS_METERS = 6371000;
const DEFAULT_MAX_STOP_DISTANCE_METERS = 350;
const DEFAULT_MAX_SEGMENT_DISTANCE_METERS = 900;

const toRadians = (value: number) => (value * Math.PI) / 180;

type NativeGeolocationModule = typeof import('@capacitor/geolocation');

let nativeGeolocationPromise: Promise<NativeGeolocationModule | null> | null = null;

const canUseNativeGeolocation = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const getNativeGeolocation = () => {
  if (!canUseNativeGeolocation()) {
    return Promise.resolve(null);
  }

  if (!nativeGeolocationPromise) {
    nativeGeolocationPromise = import('@capacitor/geolocation').catch(() => null);
  }

  return nativeGeolocationPromise;
};

const toBrowserPositionError = (message: string, code: number): GeolocationPositionError =>
  ({
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3
  }) as GeolocationPositionError;

const toSnapshot = (
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  },
  timestamp: number,
  source: 'native' | 'browser'
): CurrentLocationSnapshot => ({
  latitude: coords.latitude,
  longitude: coords.longitude,
  accuracy: coords.accuracy ?? 0,
  timestamp,
  source
});

export const formatMeters = (distanceMeters: number) => {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
};

export const hasRouteCoordinates = (stops: Stop[]) =>
  stops.some(stop => typeof stop.latitude === 'number' && typeof stop.longitude === 'number');

export const getDistanceMeters = (
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
) => {
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLng = toRadians(longitudeB - longitudeA);
  const startLat = toRadians(latitudeA);
  const endLat = toRadians(latitudeB);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toPlanarPoint = (latitude: number, longitude: number, referenceLatitude: number) => ({
  x: EARTH_RADIUS_METERS * toRadians(longitude) * Math.cos(toRadians(referenceLatitude)),
  y: EARTH_RADIUS_METERS * toRadians(latitude)
});

const getBrowserCurrentPosition = (options: PositionOptions) =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(toBrowserPositionError('Geolocation unsupported', 2));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

const watchBrowserPositionOnce = (options: PositionOptions, timeoutMs: number) =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(toBrowserPositionError('Geolocation unsupported', 2));
      return;
    }

    let settled = false;
    let watchId = 0;

    const cleanup = () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timeoutId);
    };

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(toBrowserPositionError('Watch position timed out', 3));
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      position => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(position);
      },
      error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
      options
    );
  });

const getNativeCurrentPosition = async (options: PositionOptions): Promise<CurrentLocationSnapshot> => {
  const nativeGeolocation = await getNativeGeolocation();

  if (!nativeGeolocation) {
    throw new Error('Native geolocation unavailable');
  }

  const permissionStatus = await nativeGeolocation.Geolocation.checkPermissions();
  const currentPermission =
    permissionStatus.location === 'granted' || permissionStatus.coarseLocation === 'granted'
      ? 'granted'
      : permissionStatus.location === 'denied' && permissionStatus.coarseLocation === 'denied'
        ? 'denied'
        : 'prompt';

  if (currentPermission === 'prompt') {
    await nativeGeolocation.Geolocation.requestPermissions();
  }

  const position = await nativeGeolocation.Geolocation.getCurrentPosition({
    enableHighAccuracy: Boolean(options.enableHighAccuracy),
    maximumAge: options.maximumAge,
    timeout: options.timeout
  });

  return toSnapshot(
    {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    },
    position.timestamp,
    'native'
  );
};

export const getCurrentLocationSnapshot = async (options: PositionOptions): Promise<CurrentLocationSnapshot> => {
  if (canUseNativeGeolocation()) {
    try {
      return await getNativeCurrentPosition(options);
    } catch {
      // Fall back to browser geolocation inside webview if native read fails.
    }
  }

  const position = await getBrowserCurrentPosition(options);

  return toSnapshot(
    {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    },
    position.timestamp,
    'browser'
  );
};

export const getLocationSnapshotFromWatch = async (
  options: PositionOptions,
  timeoutMs = 18000
): Promise<CurrentLocationSnapshot> => {
  if (canUseNativeGeolocation()) {
    try {
      const samples = await collectLocationSamples({
        sampleWindowMs: timeoutMs,
        maxSamples: 2,
        enableHighAccuracy: Boolean(options.enableHighAccuracy)
      });
      return samples;
    } catch {
      // Fall back to browser watch below.
    }
  }

  const position = await watchBrowserPositionOnce(options, timeoutMs);

  return toSnapshot(
    {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    },
    position.timestamp,
    'browser'
  );
};

export const queryLocationPermissionState = async (): Promise<LocationPermissionState> => {
  if (canUseNativeGeolocation()) {
    try {
      const nativeGeolocation = await getNativeGeolocation();
      const permissionStatus = await nativeGeolocation?.Geolocation.checkPermissions();

      if (!permissionStatus) {
        return 'unsupported';
      }

      if (permissionStatus.location === 'granted' || permissionStatus.coarseLocation === 'granted') {
        return 'granted';
      }

      if (permissionStatus.location === 'denied' && permissionStatus.coarseLocation === 'denied') {
        return 'denied';
      }

      return 'prompt';
    } catch {
      return 'unknown';
    }
  }

  if (!('permissions' in navigator) || typeof navigator.permissions?.query !== 'function') {
    return 'unsupported';
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state as Extract<LocationPermissionState, 'granted' | 'denied' | 'prompt'>;
  } catch {
    return 'unsupported';
  }
};

export const isLikelyInAppBrowser = () => {
  const agent = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line|wv/i.test(agent);
};

export const openCurrentPageInChrome = () => {
  const currentUrl = window.location.href;
  const agent = navigator.userAgent || '';
  const isAndroid = /Android/i.test(agent);

  if (!isAndroid) {
    const nextWindow = window.open(currentUrl, '_blank', 'noopener,noreferrer');
    if (!nextWindow) {
      window.location.href = currentUrl;
    }
    return;
  }

  try {
    const url = new URL(currentUrl);
    const scheme = url.protocol.replace(':', '');
    const intentUrl =
      `intent://${url.host}${url.pathname}${url.search}${url.hash}` +
      `#Intent;scheme=${scheme};package=com.android.chrome;` +
      `S.browser_fallback_url=${encodeURIComponent(currentUrl)};end`;

    window.location.href = intentUrl;
  } catch {
    const nextWindow = window.open(currentUrl, '_blank', 'noopener,noreferrer');
    if (!nextWindow) {
      window.location.href = currentUrl;
    }
  }
};

export const watchLiveLocation = async (
  options: PositionOptions,
  onLocation: (snapshot: CurrentLocationSnapshot) => void,
  onError?: (error: GeolocationPositionError | Error) => void
) => {
  if (canUseNativeGeolocation()) {
    const nativeGeolocation = await getNativeGeolocation();

    if (nativeGeolocation) {
      try {
        const permissionStatus = await nativeGeolocation.Geolocation.checkPermissions();
        const currentPermission =
          permissionStatus.location === 'granted' || permissionStatus.coarseLocation === 'granted'
            ? 'granted'
            : permissionStatus.location === 'denied' && permissionStatus.coarseLocation === 'denied'
              ? 'denied'
              : 'prompt';

        if (currentPermission === 'prompt') {
          await nativeGeolocation.Geolocation.requestPermissions();
        }

        const watchId = await nativeGeolocation.Geolocation.watchPosition(
          {
            enableHighAccuracy: Boolean(options.enableHighAccuracy),
            timeout: options.timeout,
            maximumAge: options.maximumAge
          },
          (position, error) => {
            if (error) {
              onError?.(toBrowserPositionError(error.message, error.code ?? 2));
              return;
            }

            if (!position) {
              return;
            }

            onLocation(
              toSnapshot(
                {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracy: position.coords.accuracy
                },
                position.timestamp,
                'native'
              )
            );
          }
        );

        return () => {
          void nativeGeolocation.Geolocation.clearWatch({ id: watchId });
        };
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Unable to start native location watch'));
      }
    }
  }

  if (!navigator.geolocation) {
    throw toBrowserPositionError('Geolocation unsupported', 2);
  }

  const watchId = navigator.geolocation.watchPosition(
    position => {
      onLocation(
        toSnapshot(
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          },
          position.timestamp,
          'browser'
        )
      );
    },
    error => onError?.(error),
    options
  );

  return () => navigator.geolocation.clearWatch(watchId);
};

export const collectLocationSamples = async ({
  sampleWindowMs = 7000,
  maxSamples = 4,
  enableHighAccuracy = true
}: {
  sampleWindowMs?: number;
  maxSamples?: number;
  enableHighAccuracy?: boolean;
} = {}): Promise<CurrentLocationSnapshot> => {
  const samples: CurrentLocationSnapshot[] = [];

  return new Promise((resolve, reject) => {
    let settled = false;
    let stopWatching: (() => void) | undefined;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (stopWatching) {
        stopWatching();
      }
      clearTimeout(timeoutId);

      if (samples.length === 0) {
        reject(new Error('No GPS samples captured.'));
        return;
      }

      const rankedSamples = [...samples].sort((left, right) => left.accuracy - right.accuracy);
      const bestSamples = rankedSamples.slice(0, Math.min(rankedSamples.length, 3));
      const latitude = bestSamples.reduce((sum, sample) => sum + sample.latitude, 0) / bestSamples.length;
      const longitude = bestSamples.reduce((sum, sample) => sum + sample.longitude, 0) / bestSamples.length;
      const accuracy = bestSamples[0].accuracy;
      const latestTimestamp = bestSamples.reduce((latest, sample) => Math.max(latest, sample.timestamp), 0);

      resolve({
        latitude,
        longitude,
        accuracy,
        timestamp: latestTimestamp,
        source: bestSamples.some(sample => sample.source === 'native') ? 'native' : 'browser',
        sampleCount: samples.length
      });
    };

    const timeoutId = window.setTimeout(finish, sampleWindowMs);

    void watchLiveLocation(
      {
        enableHighAccuracy,
        timeout: sampleWindowMs,
        maximumAge: 0
      },
      snapshot => {
        samples.push(snapshot);
        if (samples.length >= maxSamples) {
          finish();
        }
      },
      error => {
        if (samples.length > 0) {
          finish();
          return;
        }

        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error('Unable to capture GPS samples'));
      }
    ).then(stop => {
      stopWatching = stop;
    }).catch(error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error instanceof Error ? error : new Error('Unable to start location watch'));
    });
  });
};

export const requestBestCurrentLocation = async (): Promise<CurrentLocationSnapshot> => {
  try {
    return await collectLocationSamples({
      sampleWindowMs: 6500,
      maxSamples: 4,
      enableHighAccuracy: true
    });
  } catch {
    try {
      return await getCurrentLocationSnapshot({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
    } catch {
      return getLocationSnapshotFromWatch(
        {
          enableHighAccuracy: true,
          timeout: 18000,
          maximumAge: 0
        },
        18000
      );
    }
  }
};

export const getLocationErrorMessage = (
  error: GeolocationPositionError | Error,
  permissionState: LocationPermissionState = 'unknown',
  inAppBrowser = false
) => {
  const secureBrowserContext =
    typeof window === 'undefined' ? true : window.isSecureContext || window.location.hostname === 'localhost';

  if (!canUseNativeGeolocation() && !secureBrowserContext) {
    return 'This browser preview is not secure enough for GPS. Open the HTTPS live site or install the app, then try again.';
  }

  if (permissionState === 'denied') {
    return inAppBrowser
      ? 'Location is blocked in this in-app browser. Allow location for the browser app or open this page in Chrome.'
      : 'Phone location can be on and this can still fail if Chrome blocked this site. Allow Location for this site or browser, then try again.';
  }

  if ('code' in error) {
    if (error.code === error.PERMISSION_DENIED) {
      return inAppBrowser
        ? 'This in-app browser did not grant location access. Try opening the app in Chrome or allow location for this browser app.'
        : 'Location permission was denied for this site or browser. Allow Location for this site in Chrome, then try again.';
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
      return inAppBrowser
        ? 'This browser could not read the phone location. Try again or open the app in Chrome.'
        : 'Current location could not be determined. Move to an open area and try again.';
    }

    if (error.code === error.TIMEOUT) {
      return inAppBrowser
        ? 'Location request timed out in this in-app browser. Try again or open the app in Chrome once GPS is stable.'
        : 'Location request timed out. Try again once phone GPS is stable.';
    }
  }

  return inAppBrowser
    ? 'This browser could not read your location right now. Try again or open the app in Chrome.'
    : 'Unable to read your current location right now.';
};

export const findNearestMappedStop = (
  stops: Stop[],
  location: CurrentLocationSnapshot,
  maxDistanceMeters = DEFAULT_MAX_STOP_DISTANCE_METERS
): StopMatch | null => {
  const mappedStops = stops.filter(
    stop => typeof stop.latitude === 'number' && typeof stop.longitude === 'number'
  );

  if (mappedStops.length === 0) {
    return null;
  }

  const nearest = mappedStops.reduce<StopMatch | null>((bestMatch, stop) => {
    const distanceMeters = getDistanceMeters(
      location.latitude,
      location.longitude,
      stop.latitude!,
      stop.longitude!
    );

    if (!bestMatch || distanceMeters < bestMatch.distanceMeters) {
      return { stop, distanceMeters };
    }

    return bestMatch;
  }, null);

  if (!nearest) {
    return null;
  }

  const allowedDistance = Math.max(
    Math.min(maxDistanceMeters, (nearest.stop.radiusMeters ?? maxDistanceMeters) + Math.round(location.accuracy)),
    nearest.stop.radiusMeters ?? 60
  );

  if (nearest.distanceMeters > allowedDistance) {
    return null;
  }

  return nearest;
};

export const findNearestMappedSegment = (
  stops: Stop[],
  location: CurrentLocationSnapshot,
  maxDistanceMeters = DEFAULT_MAX_SEGMENT_DISTANCE_METERS
): SegmentMatch | null => {
  const mappedStops = stops
    .filter(stop => typeof stop.latitude === 'number' && typeof stop.longitude === 'number')
    .sort((left, right) => left.km - right.km);

  if (mappedStops.length < 2) {
    return null;
  }

  const nearestSegment = mappedStops.slice(0, -1).reduce<SegmentMatch | null>((bestMatch, startStop, index) => {
    const endStop = mappedStops[index + 1];
    const referenceLatitude = (location.latitude + startStop.latitude! + endStop.latitude!) / 3;
    const point = toPlanarPoint(location.latitude, location.longitude, referenceLatitude);
    const segmentStart = toPlanarPoint(startStop.latitude!, startStop.longitude!, referenceLatitude);
    const segmentEnd = toPlanarPoint(endStop.latitude!, endStop.longitude!, referenceLatitude);
    const segmentVectorX = segmentEnd.x - segmentStart.x;
    const segmentVectorY = segmentEnd.y - segmentStart.y;
    const segmentLengthSquared = segmentVectorX ** 2 + segmentVectorY ** 2;
    const projectionRatio =
      segmentLengthSquared === 0
        ? 0
        : clamp(
            ((point.x - segmentStart.x) * segmentVectorX + (point.y - segmentStart.y) * segmentVectorY) /
              segmentLengthSquared,
            0,
            1
          );
    const projectedPoint = {
      x: segmentStart.x + segmentVectorX * projectionRatio,
      y: segmentStart.y + segmentVectorY * projectionRatio
    };
    const distanceMeters = Math.hypot(point.x - projectedPoint.x, point.y - projectedPoint.y);
    const estimatedKm = Number((startStop.km + (endStop.km - startStop.km) * projectionRatio).toFixed(2));
    const nextMatch: SegmentMatch = {
      startStop,
      endStop,
      distanceMeters,
      estimatedKm,
      progressRatio: projectionRatio
    };

    if (!bestMatch || nextMatch.distanceMeters < bestMatch.distanceMeters) {
      return nextMatch;
    }

    return bestMatch;
  }, null);

  const allowedDistance = Math.max(220, Math.min(maxDistanceMeters, Math.round(location.accuracy * 2)));

  if (!nearestSegment || nearestSegment.distanceMeters > allowedDistance) {
    return null;
  }

  return nearestSegment;
};
