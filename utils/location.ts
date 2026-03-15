import type { Stop } from '../types';

export interface CurrentLocationSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
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
const DEFAULT_MAX_DISTANCE_METERS = 2000;

const toRadians = (value: number) => (value * Math.PI) / 180;

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

const getCurrentPosition = (options: PositionOptions) =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

const watchPositionOnce = (options: PositionOptions, timeoutMs: number) =>
  new Promise<GeolocationPosition>((resolve, reject) => {
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
      reject({
        code: 3,
        message: 'Watch position timed out',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      } as GeolocationPositionError);
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

export const getCurrentLocationSnapshot = async (options: PositionOptions): Promise<CurrentLocationSnapshot> => {
  const position = await getCurrentPosition(options);

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp
  };
};

export const getLocationSnapshotFromWatch = async (
  options: PositionOptions,
  timeoutMs = 18000
): Promise<CurrentLocationSnapshot> => {
  const position = await watchPositionOnce(options, timeoutMs);

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp
  };
};

export const queryLocationPermissionState = async (): Promise<LocationPermissionState> => {
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

export const requestBestCurrentLocation = async (): Promise<CurrentLocationSnapshot> => {
  try {
    return await getCurrentLocationSnapshot({
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 300000
    });
  } catch {
    try {
      return await getCurrentLocationSnapshot({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      });
    } catch {
      return getLocationSnapshotFromWatch(
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        },
        20000
      );
    }
  }
};

export const getLocationErrorMessage = (
  error: GeolocationPositionError | Error,
  permissionState: LocationPermissionState = 'unknown',
  inAppBrowser = false
) => {
  if (permissionState === 'denied') {
    return inAppBrowser
      ? 'Location is blocked in this in-app browser. Allow location for the browser app or open this page in Chrome.'
      : 'Location permission is blocked for this site. Allow location in your browser settings, then try again.';
  }

  if ('code' in error) {
    if (error.code === error.PERMISSION_DENIED) {
      return inAppBrowser
        ? 'This in-app browser did not grant location access. Try opening the app in Chrome or allow location for this browser app.'
        : 'Location permission was denied. Allow location for this site, then try again.';
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
      return inAppBrowser
        ? 'This browser could not read the phone location. Try again or open the app in Chrome.'
        : 'Current location could not be determined. Move to an open area and try again.';
    }

    if (error.code === error.TIMEOUT) {
      return inAppBrowser
        ? 'Location request timed out in this in-app browser. Try again or open the app in Chrome once GPS is stable.'
        : 'Location request timed out. Try again once GPS is stable.';
    }
  }

  return inAppBrowser
    ? 'This browser could not read your location right now. Try again or open the app in Chrome.'
    : 'Unable to read your current location right now.';
};

export const findNearestMappedStop = (
  stops: Stop[],
  location: CurrentLocationSnapshot,
  maxDistanceMeters = DEFAULT_MAX_DISTANCE_METERS
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

  const allowedDistance = Math.max(maxDistanceMeters, Math.round(location.accuracy * 1.5));

  if (!nearest || nearest.distanceMeters > allowedDistance) {
    return null;
  }

  return nearest;
};

export const findNearestMappedSegment = (
  stops: Stop[],
  location: CurrentLocationSnapshot,
  maxDistanceMeters = DEFAULT_MAX_DISTANCE_METERS
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

  const allowedDistance = Math.max(maxDistanceMeters, Math.round(location.accuracy * 1.5));

  if (!nearestSegment || nearestSegment.distanceMeters > allowedDistance) {
    return null;
  }

  return nearestSegment;
};
