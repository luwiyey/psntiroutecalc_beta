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

const getRoute = (routeId: string) => {
  const route = ROUTES.find(candidate => candidate.id === routeId);
  if (!route) {
    throw new Error(`Route ${routeId} not found`);
  }

  return route;
};

describe('Cabanatuan fare-guide route data', () => {
  it.each([
    [CABANATUAN_VIA_TARLAC_ROUTE_ID, 86],
    [CABANATUAN_VIA_SAN_JOSE_ROUTE_ID, 83]
  ])('starts %s at the guide KM', (routeId, startKm) => {
    const route = getRoute(routeId);

    expect(route.stops[0].km).toBe(startKm);
    expect(route.stops[0].name).toBe('Cabanatuan');
    expect(route.stops.at(-1)?.km).toBe(281);
    expect(route.stops.at(-1)?.name).toBe('Baguio');
  });

  it.each([CABANATUAN_VIA_TARLAC_ROUTE_ID, CABANATUAN_VIA_SAN_JOSE_ROUTE_ID])(
    'uses KM 241 for Maoasoas on %s',
    routeId => {
      const route = getRoute(routeId);
      const maoasoas = route.stops.find(stop => stop.name === 'Maoasoas');

      expect(maoasoas?.km).toBe(241);
      expect(maoasoas?.distanceToBaguio).toBe(40);
    }
  );
});

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

  it('keeps the aircon minimum fare through 26 km', () => {
    const fare = calculateFare(26, getRouteFare(AIRCON_BAYAMBANG_ROUTE_ID));

    expect(fare.reg).toBe(70);
    expect(fare.disc).toBe(56);
    expect(fare.isMinApplied).toBe(true);
  });

  it('uses the computed Bayambang aircon fare after 26 km', () => {
    const fare = calculateFare(27, getRouteFare(AIRCON_BAYAMBANG_ROUTE_ID));

    expect(fare.reg).toBe(73);
    expect(fare.disc).toBe(58);
    expect(fare.isMinApplied).toBe(false);
  });

  it.each([1, 24, 25, 26])('uses the new Cabanatuan via Tarlac minimum at %s km', distance => {
    const fare = calculateFare(distance, getRouteFare(CABANATUAN_VIA_TARLAC_ROUTE_ID));

    expect(fare.reg).toBe(70);
    expect(fare.disc).toBe(56);
    expect(fare.isMinApplied).toBe(true);
  });

  it('computes Cabanatuan via Tarlac fares beyond the 26 km minimum window', () => {
    const fare = calculateFare(27, getRouteFare(CABANATUAN_VIA_TARLAC_ROUTE_ID));

    expect(fare.reg).toBe(73);
    expect(fare.disc).toBe(58);
    expect(fare.isMinApplied).toBe(false);
  });

  it('uses the new Cabanatuan via San Jose minimum through 26 km', () => {
    const fare = calculateFare(26, getRouteFare(CABANATUAN_VIA_SAN_JOSE_ROUTE_ID));

    expect(fare.reg).toBe(70);
    expect(fare.disc).toBe(56);
    expect(fare.isMinApplied).toBe(true);
  });

  it('computes Cabanatuan via San Jose fares after the 26 km minimum window', () => {
    const fare = calculateFare(27, getRouteFare(CABANATUAN_VIA_SAN_JOSE_ROUTE_ID));

    expect(fare.reg).toBe(73);
    expect(fare.disc).toBe(58);
    expect(fare.isMinApplied).toBe(false);
  });

  it('uses the computed fare after the new aircon minimum window', () => {
    const fare = calculateFare(27, getRouteFare(TARLAC_ROUTE_ID));

    expect(fare.reg).toBe(73);
    expect(fare.disc).toBe(58);
    expect(fare.isMinApplied).toBe(false);
  });

  it('rounds an exact .50 fare down and a value above .50 up', () => {
    const exactHalf = calculateFare(35, getRouteFare(TARLAC_ROUTE_ID));
    const aboveHalf = calculateFare(37, getRouteFare(TARLAC_ROUTE_ID));

    expect(exactHalf.rawReg).toBe(94.5);
    expect(exactHalf.reg).toBe(94);
    expect(aboveHalf.rawReg).toBeCloseTo(99.9);
    expect(aboveHalf.reg).toBe(100);
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
