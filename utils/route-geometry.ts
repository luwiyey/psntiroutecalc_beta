import type { RouteLandmark, RouteSegment, Stop } from '../types';

const getStopKey = (routeId: string, stopName: string) => `${routeId}::${stopName}`.toLowerCase();
const getSegmentKey = (routeId: string, startStopName: string, endStopName: string) =>
  `${routeId}::${startStopName}::${endStopName}`.toLowerCase();

const MAX_LANDMARK_KM_DRIFT = 0.75;
const DEFAULT_MAX_LANDMARK_DISTANCE_METERS = 1200;
const MIN_LANDMARK_OVERRIDE_CONFIDENCE = 0.45;
const MIN_EXTRA_LANDMARK_CONFIDENCE = 0.65;
const MAX_SEGMENT_KM_DRIFT = 0.75;
const MIN_SEGMENT_OVERRIDE_CONFIDENCE = 0.45;
const MIN_EXTRA_SEGMENT_CONFIDENCE = 0.65;

const isFiniteCoordinate = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toRadians = (value: number) => (value * Math.PI) / 180;

const getDistanceMeters = (
  leftLatitude: number,
  leftLongitude: number,
  rightLatitude: number,
  rightLongitude: number
) => {
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(rightLatitude - leftLatitude);
  const longitudeDelta = toRadians(rightLongitude - leftLongitude);
  const latitudeA = toRadians(leftLatitude);
  const latitudeB = toRadians(rightLatitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
};

const hasUsableLandmarkCoordinates = (landmark: RouteLandmark) =>
  isFiniteCoordinate(landmark.latitude) && isFiniteCoordinate(landmark.longitude);

const hasUsableSegmentPath = (segment: RouteSegment) =>
  segment.pathPoints.length >= 2 &&
  segment.pathPoints.every(
    point => isFiniteCoordinate(point.latitude) && isFiniteCoordinate(point.longitude)
  );

const isRouteLandmarkTrusted = (landmark: RouteLandmark, seededLandmark?: RouteLandmark) => {
  if (!Number.isFinite(landmark.km)) {
    return false;
  }

  if (!hasUsableLandmarkCoordinates(landmark)) {
    return Boolean(seededLandmark);
  }

  const minimumConfidence = seededLandmark
    ? MIN_LANDMARK_OVERRIDE_CONFIDENCE
    : MIN_EXTRA_LANDMARK_CONFIDENCE;
  if ((landmark.confidenceScore ?? 0) < minimumConfidence) {
    return false;
  }

  if (!seededLandmark) {
    return true;
  }

  if (Math.abs(landmark.km - seededLandmark.km) > MAX_LANDMARK_KM_DRIFT) {
    return false;
  }

  if (!hasUsableLandmarkCoordinates(seededLandmark)) {
    return true;
  }

  const allowedDistance = Math.max(
    DEFAULT_MAX_LANDMARK_DISTANCE_METERS,
    (seededLandmark.radiusMeters ?? 60) * 8
  );

  return (
    getDistanceMeters(
      landmark.latitude!,
      landmark.longitude!,
      seededLandmark.latitude!,
      seededLandmark.longitude!
    ) <= allowedDistance
  );
};

const isRouteSegmentTrusted = (segment: RouteSegment, seededSegment?: RouteSegment) => {
  if (!Number.isFinite(segment.startKm) || !Number.isFinite(segment.endKm) || segment.endKm <= segment.startKm) {
    return false;
  }

  if (!hasUsableSegmentPath(segment)) {
    return Boolean(seededSegment);
  }

  const minimumConfidence = seededSegment
    ? MIN_SEGMENT_OVERRIDE_CONFIDENCE
    : MIN_EXTRA_SEGMENT_CONFIDENCE;
  if ((segment.confidenceScore ?? 0) < minimumConfidence) {
    return false;
  }

  if (!seededSegment) {
    return true;
  }

  return (
    Math.abs(segment.startKm - seededSegment.startKm) <= MAX_SEGMENT_KM_DRIFT &&
    Math.abs(segment.endKm - seededSegment.endKm) <= MAX_SEGMENT_KM_DRIFT
  );
};

export const createRouteLandmarkId = (routeId: string, stopName: string) =>
  `landmark-${getStopKey(routeId, stopName).replace(/[^a-z0-9]+/g, '-')}`;

export const createRouteSegmentId = (routeId: string, startStopName: string, endStopName: string) =>
  `segment-${getSegmentKey(routeId, startStopName, endStopName).replace(/[^a-z0-9]+/g, '-')}`;

export const buildSeedRouteLandmarks = (
  routeId: string,
  routeLabel: string,
  stops: Stop[]
): RouteLandmark[] =>
  stops.map(stop => ({
    id: createRouteLandmarkId(routeId, stop.name),
    routeId,
    routeLabel,
    stopName: stop.name,
    km: stop.km,
    latitude: isFiniteCoordinate(stop.latitude) ? stop.latitude : null,
    longitude: isFiniteCoordinate(stop.longitude) ? stop.longitude : null,
    radiusMeters: typeof stop.radiusMeters === 'number' && Number.isFinite(stop.radiusMeters) ? stop.radiusMeters : null,
    googlePlaceId: stop.googlePlaceId ?? null,
    googleMapsQuery: stop.googleMapsQuery ?? null,
    aliases: stop.aliases ?? [],
    source: 'seeded',
    confidenceScore: isFiniteCoordinate(stop.latitude) && isFiniteCoordinate(stop.longitude) ? 0.35 : 0.1,
    updatedAt: 0
  }));

export const buildSeedRouteSegments = (
  routeId: string,
  routeLabel: string,
  stops: Stop[]
): RouteSegment[] => {
  const sortedStops = [...stops].sort((left, right) => left.km - right.km || left.name.localeCompare(right.name));

  return sortedStops.flatMap((startStop, index) => {
    const endStop = sortedStops[index + 1];

    if (!endStop || endStop.km <= startStop.km) {
      return [];
    }

    const pathPoints =
      isFiniteCoordinate(startStop.latitude) &&
      isFiniteCoordinate(startStop.longitude) &&
      isFiniteCoordinate(endStop.latitude) &&
      isFiniteCoordinate(endStop.longitude)
        ? [
            { latitude: startStop.latitude, longitude: startStop.longitude },
            { latitude: endStop.latitude, longitude: endStop.longitude }
          ]
        : [];

    return [{
      id: createRouteSegmentId(routeId, startStop.name, endStop.name),
      routeId,
      routeLabel,
      startStopName: startStop.name,
      endStopName: endStop.name,
      startKm: startStop.km,
      endKm: endStop.km,
      pathPoints,
      source: 'seeded',
      confidenceScore: pathPoints.length >= 2 ? 0.3 : 0.1,
      updatedAt: 0
    }];
  });
};

export const mergeStopsWithRouteLandmarks = (
  routeId: string,
  stops: Stop[],
  landmarks: RouteLandmark[]
): Stop[] => {
  if (landmarks.length === 0) {
    return stops;
  }

  const byStopName = new Map<string, RouteLandmark>();
  landmarks.forEach(landmark => {
    if (landmark.routeId === routeId) {
      byStopName.set(landmark.stopName.toLowerCase(), landmark);
    }
  });

  return stops.map(stop => {
    const landmark = byStopName.get(stop.name.toLowerCase());

    if (!landmark) {
      return stop;
    }

    const mergedAliases = [...new Set([...(stop.aliases ?? []), ...landmark.aliases])];

    return {
      ...stop,
      km: Number.isFinite(landmark.km) ? landmark.km : stop.km,
      ...(isFiniteCoordinate(landmark.latitude) ? { latitude: landmark.latitude } : {}),
      ...(isFiniteCoordinate(landmark.longitude) ? { longitude: landmark.longitude } : {}),
      ...(typeof landmark.radiusMeters === 'number' && Number.isFinite(landmark.radiusMeters)
        ? { radiusMeters: landmark.radiusMeters }
        : {}),
      ...(landmark.googlePlaceId ? { googlePlaceId: landmark.googlePlaceId } : {}),
      ...(landmark.googleMapsQuery ? { googleMapsQuery: landmark.googleMapsQuery } : {}),
      ...(mergedAliases.length ? { aliases: mergedAliases } : {})
    };
  });
};

export const mergeRouteLandmarks = (
  seeded: RouteLandmark[],
  remote: RouteLandmark[]
) => {
  const byKey = new Map<string, RouteLandmark>();
  const seededByKey = new Map<string, RouteLandmark>();

  seeded.forEach(landmark => {
    const key = getStopKey(landmark.routeId, landmark.stopName);
    seededByKey.set(key, landmark);
    byKey.set(key, landmark);
  });
  remote.forEach(landmark => {
    const key = getStopKey(landmark.routeId, landmark.stopName);
    const seededLandmark = seededByKey.get(key);
    if (isRouteLandmarkTrusted(landmark, seededLandmark)) {
      byKey.set(key, landmark);
    }
  });

  return [...byKey.values()].sort((left, right) => left.km - right.km || left.stopName.localeCompare(right.stopName));
};

export const mergeRouteSegments = (
  seeded: RouteSegment[],
  remote: RouteSegment[]
) => {
  const byKey = new Map<string, RouteSegment>();
  const seededByKey = new Map<string, RouteSegment>();

  seeded.forEach(segment => {
    const key = getSegmentKey(segment.routeId, segment.startStopName, segment.endStopName);
    seededByKey.set(key, segment);
    byKey.set(key, segment);
  });
  remote.forEach(segment => {
    const key = getSegmentKey(segment.routeId, segment.startStopName, segment.endStopName);
    const seededSegment = seededByKey.get(key);
    if (isRouteSegmentTrusted(segment, seededSegment)) {
      byKey.set(key, segment);
    }
  });

  return [...byKey.values()].sort(
    (left, right) => left.startKm - right.startKm || left.endKm - right.endKm || left.startStopName.localeCompare(right.startStopName)
  );
};
