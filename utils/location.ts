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

const EARTH_RADIUS_METERS = 6371000;

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

export const findNearestMappedStop = (
  stops: Stop[],
  location: CurrentLocationSnapshot,
  maxDistanceMeters = 2000
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

  if (!nearest || nearest.distanceMeters > maxDistanceMeters) {
    return null;
  }

  return nearest;
};
