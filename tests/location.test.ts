import { describe, expect, it } from 'vitest';
import type { Stop } from '../types';
import {
  findNearestMappedSegment,
  findNearestMappedStop,
  getLocationReliabilityMessage,
  type CurrentLocationSnapshot
} from '../utils/location';

const corridorStops: Stop[] = [
  { name: 'Stop A', km: 0, latitude: 16.4123, longitude: 120.5945, radiusMeters: 60 },
  { name: 'Stop B', km: 5, latitude: 16.4223, longitude: 120.6045, radiusMeters: 60 },
  { name: 'Stop C', km: 10, latitude: 16.4323, longitude: 120.6145, radiusMeters: 60 }
];

const createSnapshot = (overrides: Partial<CurrentLocationSnapshot>): CurrentLocationSnapshot => ({
  latitude: 16.41231,
  longitude: 120.59449,
  accuracy: 25,
  timestamp: Date.now(),
  source: 'browser',
  ...overrides
});

describe('GPS pickup assist matching', () => {
  it('matches the nearest stop when the GPS reading is accurate enough', () => {
    const match = findNearestMappedStop(corridorStops, createSnapshot({}));

    expect(match?.stop.name).toBe('Stop A');
  });

  it('refuses an exact stop match when the GPS accuracy is too broad', () => {
    const match = findNearestMappedStop(corridorStops, createSnapshot({ accuracy: 420 }));

    expect(match).toBeNull();
  });

  it('refuses a segment match when the GPS accuracy is too broad', () => {
    const match = findNearestMappedSegment(corridorStops, createSnapshot({ accuracy: 500 }));

    expect(match).toBeNull();
  });

  it('explains when the GPS reading is too broad for safe pickup assist', () => {
    expect(getLocationReliabilityMessage(createSnapshot({ accuracy: 1300 }))).toContain('too broad');
  });
});
