import { describe, expect, it } from 'vitest';
import type { RouteLandmark, RouteSegment } from '../types';
import { mergeRouteLandmarks, mergeRouteSegments } from '../utils/route-geometry';

const seededLandmark: RouteLandmark = {
  id: 'seeded-baguio',
  routeId: 'route-1',
  routeLabel: 'Route 1',
  stopName: 'Baguio',
  km: 271,
  latitude: 16.4123,
  longitude: 120.5945,
  radiusMeters: 60,
  googlePlaceId: null,
  googleMapsQuery: null,
  aliases: [],
  source: 'seeded',
  confidenceScore: 0.35,
  updatedAt: 0
};

const remoteLandmark = (overrides: Partial<RouteLandmark>): RouteLandmark => ({
  ...seededLandmark,
  id: 'remote-baguio',
  source: 'manual',
  confidenceScore: 0.88,
  updatedAt: Date.now(),
  ...overrides
});

const seededSegment: RouteSegment = {
  id: 'segment-a-b',
  routeId: 'route-1',
  routeLabel: 'Route 1',
  startStopName: 'A',
  endStopName: 'B',
  startKm: 10,
  endKm: 15,
  pathPoints: [
    { latitude: 16.401, longitude: 120.58 },
    { latitude: 16.411, longitude: 120.59 }
  ],
  source: 'seeded',
  confidenceScore: 0.3,
  updatedAt: 0
};

const remoteSegment = (overrides: Partial<RouteSegment>): RouteSegment => ({
  ...seededSegment,
  id: 'segment-a-b-remote',
  source: 'road-snapped',
  confidenceScore: 0.92,
  updatedAt: Date.now(),
  ...overrides
});

describe('route geometry trust', () => {
  it('keeps the seeded landmark when a remote override drifts too far', () => {
    const merged = mergeRouteLandmarks(
      [seededLandmark],
      [
        remoteLandmark({
          latitude: 15.5,
          longitude: 120.1,
          km: 280
        })
      ]
    );

    expect(merged[0].latitude).toBe(seededLandmark.latitude);
    expect(merged[0].km).toBe(seededLandmark.km);
    expect(merged[0].source).toBe('seeded');
  });

  it('accepts a trusted nearby remote landmark override', () => {
    const merged = mergeRouteLandmarks(
      [seededLandmark],
      [
        remoteLandmark({
          latitude: 16.41236,
          longitude: 120.59458,
          km: 271.1,
          googlePlaceId: 'place-1'
        })
      ]
    );

    expect(merged[0].latitude).toBe(16.41236);
    expect(merged[0].source).toBe('manual');
    expect(merged[0].googlePlaceId).toBe('place-1');
  });

  it('keeps the seeded segment when a remote segment drifts too far in KM', () => {
    const merged = mergeRouteSegments(
      [seededSegment],
      [
        remoteSegment({
          startKm: 12,
          endKm: 20
        })
      ]
    );

    expect(merged[0].startKm).toBe(seededSegment.startKm);
    expect(merged[0].endKm).toBe(seededSegment.endKm);
    expect(merged[0].source).toBe('seeded');
  });

  it('accepts a trusted nearby remote segment override', () => {
    const merged = mergeRouteSegments(
      [seededSegment],
      [
        remoteSegment({
          startKm: 10.1,
          endKm: 14.9,
          pathPoints: [
            { latitude: 16.4012, longitude: 120.5802 },
            { latitude: 16.4108, longitude: 120.5898 }
          ]
        })
      ]
    );

    expect(merged[0].source).toBe('road-snapped');
    expect(merged[0].startKm).toBe(10.1);
  });
});
