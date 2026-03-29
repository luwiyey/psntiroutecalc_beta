import type { RouteLandmark, RouteSegment, Stop } from '../types';

const getStopKey = (routeId: string, stopName: string) => `${routeId}::${stopName}`.toLowerCase();
const getSegmentKey = (routeId: string, startStopName: string, endStopName: string) =>
  `${routeId}::${startStopName}::${endStopName}`.toLowerCase();

const isFiniteCoordinate = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

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

  seeded.forEach(landmark => byKey.set(getStopKey(landmark.routeId, landmark.stopName), landmark));
  remote.forEach(landmark => byKey.set(getStopKey(landmark.routeId, landmark.stopName), landmark));

  return [...byKey.values()].sort((left, right) => left.km - right.km || left.stopName.localeCompare(right.stopName));
};

export const mergeRouteSegments = (
  seeded: RouteSegment[],
  remote: RouteSegment[]
) => {
  const byKey = new Map<string, RouteSegment>();

  seeded.forEach(segment =>
    byKey.set(getSegmentKey(segment.routeId, segment.startStopName, segment.endStopName), segment)
  );
  remote.forEach(segment =>
    byKey.set(getSegmentKey(segment.routeId, segment.startStopName, segment.endStopName), segment)
  );

  return [...byKey.values()].sort(
    (left, right) => left.startKm - right.startKm || left.endKm - right.endKm || left.startStopName.localeCompare(right.startStopName)
  );
};
