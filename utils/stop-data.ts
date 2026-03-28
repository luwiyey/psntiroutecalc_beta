import type { CurrentLocationSnapshot } from './location';
import type { Stop, StopSubmission, VerifiedStop } from '../types';
import { getDistanceMeters } from './location';

const DEFAULT_STOP_RADIUS_METERS = 60;
const MAX_STOP_RADIUS_METERS = 180;

const getStopKey = (routeId: string, stopName: string) => `${routeId}::${stopName}`.toLowerCase();

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getWeightedAverage = (values: Array<{ value: number; weight: number }>) => {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight === 0) {
    return 0;
  }

  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
};

export const createStopSubmissionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `stop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createVerifiedStopId = (routeId: string, stopName: string) => {
  return `verified-${getStopKey(routeId, stopName).replace(/[^a-z0-9]+/g, '-')}`;
};

export const summarizeStopSamples = (
  samples: CurrentLocationSnapshot[],
  fallbackRadiusMeters = DEFAULT_STOP_RADIUS_METERS
) => {
  const usableSamples = samples.filter(sample => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude));

  if (usableSamples.length === 0) {
    throw new Error('No usable GPS samples were captured.');
  }

  const bestSamples = [...usableSamples]
    .sort((left, right) => left.accuracy - right.accuracy)
    .slice(0, Math.min(usableSamples.length, 3));

  const lat = getWeightedAverage(
    bestSamples.map(sample => ({
      value: sample.latitude,
      weight: 1 / Math.max(sample.accuracy, 5)
    }))
  );
  const lng = getWeightedAverage(
    bestSamples.map(sample => ({
      value: sample.longitude,
      weight: 1 / Math.max(sample.accuracy, 5)
    }))
  );
  const averageAccuracy = getWeightedAverage(
    bestSamples.map(sample => ({
      value: sample.accuracy,
      weight: 1 / Math.max(sample.accuracy, 5)
    }))
  );
  const farthestDistance = bestSamples.reduce((maxDistance, sample) => {
    const distance = getDistanceMeters(lat, lng, sample.latitude, sample.longitude);
    return Math.max(maxDistance, distance);
  }, 0);
  const radiusMeters = clamp(
    Math.round(Math.max(fallbackRadiusMeters, averageAccuracy, farthestDistance + 20)),
    35,
    MAX_STOP_RADIUS_METERS
  );

  return {
    latitude: lat,
    longitude: lng,
    accuracyMeters: Number(averageAccuracy.toFixed(1)),
    radiusMeters,
    sampleCount: usableSamples.length,
    source: bestSamples.some(sample => sample.source === 'native') ? 'native' : 'browser' as const
  };
};

export const mergeStopsWithSubmissions = (
  routeId: string,
  stops: Stop[],
  submissions: StopSubmission[]
): Stop[] => {
  if (submissions.length === 0) {
    return stops;
  }

  const grouped = submissions.reduce<Map<string, StopSubmission[]>>((map, submission) => {
    const key = getStopKey(submission.routeId, submission.stopName);
    const nextGroup = map.get(key) ?? [];
    nextGroup.push(submission);
    map.set(key, nextGroup);
    return map;
  }, new Map());

  return stops.map(stop => {
    const stopKey = getStopKey(routeId, stop.name);
    const matchedSubmissions = grouped.get(stopKey) ?? [];

    if (matchedSubmissions.length === 0) {
      return stop;
    }

    const latitude = getWeightedAverage(
      matchedSubmissions.map(submission => ({
        value: submission.latitude,
        weight: 1 / Math.max(submission.accuracyMeters, 5)
      }))
    );
    const longitude = getWeightedAverage(
      matchedSubmissions.map(submission => ({
        value: submission.longitude,
        weight: 1 / Math.max(submission.accuracyMeters, 5)
      }))
    );
    const averageAccuracy = getWeightedAverage(
      matchedSubmissions.map(submission => ({
        value: submission.accuracyMeters,
        weight: 1 / Math.max(submission.accuracyMeters, 5)
      }))
    );
    const farthestDistance = matchedSubmissions.reduce((maxDistance, submission) => {
      const distance = getDistanceMeters(latitude, longitude, submission.latitude, submission.longitude);
      return Math.max(maxDistance, distance);
    }, 0);
    const suggestedRadius = matchedSubmissions.reduce((largestRadius, submission) => {
      return Math.max(largestRadius, submission.radiusMeters);
    }, DEFAULT_STOP_RADIUS_METERS);

    return {
      ...stop,
      latitude,
      longitude,
      radiusMeters: clamp(
        Math.round(Math.max(suggestedRadius, averageAccuracy, farthestDistance + 15)),
        35,
        MAX_STOP_RADIUS_METERS
      ),
      calibrationSamples: matchedSubmissions.reduce((sum, submission) => sum + Math.max(submission.sampleCount, 1), 0),
      lastCalibratedAt: matchedSubmissions.reduce((latest, submission) => Math.max(latest, submission.createdAt), 0)
    };
  });
};

export const dedupeStopSubmissions = (submissions: StopSubmission[]) => {
  const byId = new Map<string, StopSubmission>();

  submissions.forEach(submission => {
    if (!submission?.id) {
      return;
    }

    byId.set(submission.id, submission);
  });

  return [...byId.values()];
};

export const buildVerifiedStopsFromSubmissions = (
  routeId: string,
  routeLabel: string,
  stops: Stop[],
  submissions: StopSubmission[]
): VerifiedStop[] => {
  const routeSubmissions = dedupeStopSubmissions(
    submissions.filter(submission => submission.routeId === routeId)
  );

  if (routeSubmissions.length === 0) {
    return [];
  }

  const grouped = routeSubmissions.reduce<Map<string, StopSubmission[]>>((map, submission) => {
    const key = getStopKey(routeId, submission.stopName);
    const nextGroup = map.get(key) ?? [];
    nextGroup.push(submission);
    map.set(key, nextGroup);
    return map;
  }, new Map());

  return stops.flatMap(stop => {
    const stopKey = getStopKey(routeId, stop.name);
    const matchedSubmissions = grouped.get(stopKey) ?? [];

    if (matchedSubmissions.length === 0) {
      return [];
    }

    const latitude = getWeightedAverage(
      matchedSubmissions.map(submission => ({
        value: submission.latitude,
        weight: 1 / Math.max(submission.accuracyMeters, 5)
      }))
    );
    const longitude = getWeightedAverage(
      matchedSubmissions.map(submission => ({
        value: submission.longitude,
        weight: 1 / Math.max(submission.accuracyMeters, 5)
      }))
    );
    const averageAccuracy = getWeightedAverage(
      matchedSubmissions.map(submission => ({
        value: submission.accuracyMeters,
        weight: 1 / Math.max(submission.accuracyMeters, 5)
      }))
    );
    const farthestDistance = matchedSubmissions.reduce((maxDistance, submission) => {
      const distance = getDistanceMeters(latitude, longitude, submission.latitude, submission.longitude);
      return Math.max(maxDistance, distance);
    }, 0);
    const suggestedRadius = matchedSubmissions.reduce((largestRadius, submission) => {
      return Math.max(largestRadius, submission.radiusMeters);
    }, stop.radiusMeters ?? DEFAULT_STOP_RADIUS_METERS);
    const sampleCount = matchedSubmissions.reduce(
      (sum, submission) => sum + Math.max(submission.sampleCount, 1),
      0
    );
    const confidenceFromSubmissions = Math.min(matchedSubmissions.length / 4, 1) * 0.45;
    const confidenceFromSamples = Math.min(sampleCount / 10, 1) * 0.3;
    const confidenceFromAccuracy = Math.max(0, 1 - averageAccuracy / 120) * 0.25;
    const confidenceScore = Number(
      clamp(confidenceFromSubmissions + confidenceFromSamples + confidenceFromAccuracy, 0.2, 0.99).toFixed(2)
    );

    return [{
      id: createVerifiedStopId(routeId, stop.name),
      routeId,
      routeLabel,
      stopName: stop.name,
      latitude,
      longitude,
      radiusMeters: clamp(
        Math.round(Math.max(suggestedRadius, averageAccuracy, farthestDistance + 15)),
        35,
        MAX_STOP_RADIUS_METERS
      ),
      sampleCount,
      submissionCount: matchedSubmissions.length,
      confidenceScore,
      source: 'computed' as const,
      updatedAt: matchedSubmissions.reduce((latest, submission) => Math.max(latest, submission.createdAt), 0)
    }];
  });
};

export const mergeStopsWithVerifiedStops = (
  routeId: string,
  stops: Stop[],
  verifiedStops: VerifiedStop[]
): Stop[] => {
  if (verifiedStops.length === 0) {
    return stops;
  }

  const grouped = verifiedStops.reduce<Map<string, VerifiedStop>>((map, verifiedStop) => {
    map.set(getStopKey(verifiedStop.routeId, verifiedStop.stopName), verifiedStop);
    return map;
  }, new Map());

  return stops.map(stop => {
    const verifiedStop = grouped.get(getStopKey(routeId, stop.name));

    if (!verifiedStop) {
      return stop;
    }

    return {
      ...stop,
      latitude: verifiedStop.latitude,
      longitude: verifiedStop.longitude,
      radiusMeters: verifiedStop.radiusMeters,
      calibrationSamples: verifiedStop.sampleCount,
      lastCalibratedAt: verifiedStop.updatedAt
    };
  });
};

export const estimateTravelSpeedMetersPerSecond = (
  previous: CurrentLocationSnapshot | null,
  current: CurrentLocationSnapshot
) => {
  if (!previous) {
    return null;
  }

  const elapsedSeconds = Math.max((current.timestamp - previous.timestamp) / 1000, 0);

  if (elapsedSeconds < 5) {
    return null;
  }

  const traveledMeters = getDistanceMeters(
    previous.latitude,
    previous.longitude,
    current.latitude,
    current.longitude
  );

  if (traveledMeters < 8) {
    return null;
  }

  return traveledMeters / elapsedSeconds;
};

export const formatEta = (seconds: number | null) => {
  if (!seconds || !Number.isFinite(seconds)) {
    return 'ETA unavailable';
  }

  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))} sec`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (remainingSeconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes}m ${remainingSeconds}s`;
};

export const getStopAlertRadius = (stop: Stop, accuracyMeters: number) => {
  return Math.max(stop.radiusMeters ?? DEFAULT_STOP_RADIUS_METERS, Math.round(accuracyMeters * 0.9));
};
