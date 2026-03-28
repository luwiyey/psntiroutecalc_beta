import { describe, expect, it } from 'vitest';
import type { Stop, VerifiedStop } from '../types';
import { isVerifiedStopTrusted } from '../utils/stop-data';

const seedStop: Stop = {
  name: 'Baguio',
  km: 271,
  latitude: 16.4123,
  longitude: 120.5945,
  radiusMeters: 60
};

const createVerifiedStop = (overrides: Partial<VerifiedStop>): VerifiedStop => ({
  id: 'verified-baguio',
  routeId: 'route-1',
  routeLabel: 'Route 1',
  stopName: 'Baguio',
  latitude: 16.41231,
  longitude: 120.59449,
  radiusMeters: 70,
  sampleCount: 5,
  submissionCount: 3,
  confidenceScore: 0.82,
  source: 'computed',
  updatedAt: Date.now(),
  ...overrides
});

describe('verified stop trust', () => {
  it('rejects a low-evidence verified stop that drifts too far from the seeded stop', () => {
    const trusted = isVerifiedStopTrusted(
      createVerifiedStop({
        latitude: 15.8894,
        longitude: 120.5901,
        sampleCount: 1,
        submissionCount: 1,
        confidenceScore: 0.28
      }),
      seedStop
    );

    expect(trusted).toBe(false);
  });

  it('accepts a well-supported verified stop that stays close to the seeded stop', () => {
    const trusted = isVerifiedStopTrusted(createVerifiedStop({}), seedStop);

    expect(trusted).toBe(true);
  });
});
