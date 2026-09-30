import { describe, expect, it } from 'vitest';
import {
  AIRCON_BAYAMBANG_ROUTE_ID,
  CABANATUAN_ROUTE_ID,
  CABANATUAN_VIA_SAN_JOSE_ROUTE_ID,
  CABANATUAN_VIA_TARLAC_ROUTE_ID,
  CUBAO_BAGUIO_ROUTE_ID,
  DAGUPAN_SAN_CARLOS_CUBAO_ROUTE_ID,
  ORDINARY_BAYAMBANG_ROUTE_ID,
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
  it.each([
    [ORDINARY_BAYAMBANG_ROUTE_ID, 220, 176],
    [AIRCON_BAYAMBANG_ROUTE_ID, 270, 216],
    [TARLAC_ROUTE_ID, 270, 216],
    [CABANATUAN_ROUTE_ID, 270, 216],
    [CABANATUAN_VIA_SAN_JOSE_ROUTE_ID, 270, 216],
    [CABANATUAN_VIA_TARLAC_ROUTE_ID, 270, 216],
    [CUBAO_BAGUIO_ROUTE_ID, 270, 216],
    [DAGUPAN_SAN_CARLOS_CUBAO_ROUTE_ID, 270, 216]
  ])('uses the updated regular fare and 20 percent discount for %s', (routeId, regular, discounted) => {
    const fare = calculateFare(100, getRouteFare(routeId));

    expect(fare.reg).toBe(regular);
    expect(fare.disc).toBe(discounted);
    expect(fare.rawDisc).toBeCloseTo(fare.rawReg * 0.8);
    expect(fare.isMinApplied).toBe(false);
  });

  it('keeps the ordinary Bayambang minimum fare through 9 km', () => {
    const fare = calculateFare(9, getRouteFare(ORDINARY_BAYAMBANG_ROUTE_ID));

    expect(fare.reg).toBe(20);
    expect(fare.disc).toBe(16);
    expect(fare.isMinApplied).toBe(true);
  });

  it('uses the computed ordinary Bayambang fare after 9 km', () => {
    const fare = calculateFare(11, getRouteFare(ORDINARY_BAYAMBANG_ROUTE_ID));

    expect(fare.reg).toBe(24);
    expect(fare.disc).toBe(19);
    expect(fare.isMinApplied).toBe(false);
  });

  it('keeps the aircon minimum fare through 24 km', () => {
    const fare = calculateFare(24, getRouteFare(AIRCON_BAYAMBANG_ROUTE_ID));

    expect(fare.reg).toBe(60);
    expect(fare.disc).toBe(48);
    expect(fare.isMinApplied).toBe(true);
  });

  it('uses the computed fare after the new aircon minimum window', () => {
    const fare = calculateFare(27, getRouteFare(TARLAC_ROUTE_ID));

    expect(fare.reg).toBe(73);
    expect(fare.disc).toBe(58);
    expect(fare.isMinApplied).toBe(false);
  });

  it('keeps the Cubao-Baguio minimum fare through 37 km', () => {
    const fare = calculateFare(37, getRouteFare(CUBAO_BAGUIO_ROUTE_ID));

    expect(fare.reg).toBe(60);
    expect(fare.disc).toBe(48);
    expect(fare.isMinApplied).toBe(true);
  });

  it('uses the computed Cubao-Baguio fare after 37 km', () => {
    const fare = calculateFare(38, getRouteFare(CUBAO_BAGUIO_ROUTE_ID));

    expect(fare.reg).toBe(103);
    expect(fare.disc).toBe(82);
    expect(fare.isMinApplied).toBe(false);
  });

  it('uses the updated 2.7 rate for Dagupan / San Carlos to Cubao after the minimum', () => {
    const fare = calculateFare(27, getRouteFare(DAGUPAN_SAN_CARLOS_CUBAO_ROUTE_ID));

    expect(fare.reg).toBe(73);
    expect(fare.disc).toBe(58);
    expect(fare.isMinApplied).toBe(false);
  });
});
