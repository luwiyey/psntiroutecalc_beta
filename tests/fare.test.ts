import { describe, expect, it } from 'vitest';
import {
  AIRCON_BAYAMBANG_ROUTE_ID,
  CUBAO_BAGUIO_ROUTE_ID,
  DAGUPAN_SAN_CARLOS_CUBAO_ROUTE_ID,
  ROUTES,
  TARLAC_ROUTE_ID
} from '../constants';
import { calculateFare } from '../utils/fare';

const getRouteFare = (routeId: string) => {
  const route = ROUTES.find(candidate => candidate.id === routeId);
  if (!route) {
    throw new Error(`Route ${routeId} not found`);
  }

  return route.fare;
};

describe('calculateFare', () => {
  it('keeps the aircon minimum fare through 24 km', () => {
    const fare = calculateFare(24, getRouteFare(AIRCON_BAYAMBANG_ROUTE_ID));

    expect(fare.reg).toBe(60);
    expect(fare.disc).toBe(48);
    expect(fare.isMinApplied).toBe(true);
  });

  it('uses the computed fare after the aircon minimum window', () => {
    const fare = calculateFare(25, getRouteFare(TARLAC_ROUTE_ID));

    expect(fare.reg).toBe(68);
    expect(fare.disc).toBe(54);
    expect(fare.isMinApplied).toBe(false);
  });

  it('keeps the Cubao-Baguio minimum fare through 37 km', () => {
    const fare = calculateFare(37, getRouteFare(CUBAO_BAGUIO_ROUTE_ID));

    expect(fare.reg).toBe(100);
    expect(fare.disc).toBe(80);
    expect(fare.isMinApplied).toBe(true);
  });

  it('uses the computed Cubao-Baguio fare after 37 km', () => {
    const fare = calculateFare(38, getRouteFare(CUBAO_BAGUIO_ROUTE_ID));

    expect(fare.reg).toBe(103);
    expect(fare.disc).toBe(82);
    expect(fare.isMinApplied).toBe(false);
  });

  it('uses the updated 2.70 rate for Dagupan / San Carlos to Cubao', () => {
    const fare = calculateFare(25, getRouteFare(DAGUPAN_SAN_CARLOS_CUBAO_ROUTE_ID));

    expect(fare.reg).toBe(68);
    expect(fare.disc).toBe(54);
    expect(fare.isMinApplied).toBe(false);
  });
});
