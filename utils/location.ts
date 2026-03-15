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

export const getCurrentLocationSnapshot = async (options: PositionOptions): Promise<CurrentLocationSnapshot> => {
  const position = await getCurrentPosition(options);

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp
  };
};

export const requestBestCurrentLocation = async (): Promise<CurrentLocationSnapshot> => {
  try {
    return await getCurrentLocationSnapshot({
      enableHighAccuracy: false,
      timeout: 6000,
      maximumAge: 120000
    });
  } catch {
    return getCurrentLocationSnapshot({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  }
};

export const getLocationErrorMessage = (error: GeolocationPositionError | Error) => {
  if ('code' in error) {
    if (error.code === error.PERMISSION_DENIED) {
      return 'Location permission was denied. You can still choose the pickup stop manually.';
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
      return 'Current location could not be determined. Move to an open area and try again.';
    }

    if (error.code === error.TIMEOUT) {
      return 'Location request timed out. Try again once GPS is stable.';
    }
  }

  return 'Unable to read your current location right now.';
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
