import type { AppSettings, RouteProfile, Stop } from './types';

export const FARE_SETTINGS_VERSION = 5;
export const DISCOUNT_RATE_MULTIPLIER = 0.8;

export const ORDINARY_BAYAMBANG_ROUTE_ID = 'ordinary-bayambang-baguio';
export const TARLAC_ROUTE_ID = 'tarlac-baguio';
export const CABANATUAN_ROUTE_ID = 'cabanatuan-baguio';
export const CABANATUAN_VIA_SAN_JOSE_ROUTE_ID = 'cabanatuan-via-san-jose-baguio';
export const AIRCON_BAYAMBANG_ROUTE_ID = 'aircon-bayambang-baguio';
export const DEFAULT_ROUTE_ID = ORDINARY_BAYAMBANG_ROUTE_ID;

const ORDINARY_BAYAMBANG_STOPS: Stop[] = [
  { name: 'Bayambang', km: 152, isTerminal: true },
  { name: 'Bautista', km: 160 },
  { name: 'Anulid', km: 163 },
  { name: 'Laoac', km: 164 },
  { name: 'Alcala Bayan', km: 167 },
  { name: 'Kisikis / Pindangan', km: 171 },
  { name: 'Sto. Tomas', km: 175 },
  { name: 'Carmen', km: 177, isTerminal: true },
  { name: 'Villasis', km: 179 },
  { name: 'Baccag', km: 183 },
  { name: 'Nancayasan', km: 185 },
  { name: 'Urdaneta', km: 187, isTerminal: true },
  { name: 'Anonas', km: 191 },
  { name: 'Sumabnit', km: 194 },
  { name: 'Binalonan', km: 197 },
  { name: 'Vacante', km: 200 },
  { name: 'Rosario / Villa Pozzorubio', km: 203 },
  { name: 'Pozzorubio Bayan', km: 206 },
  { name: 'Batakil', km: 208 },
  { name: 'Sison NCC', km: 212 },
  { name: 'Sison Ice Plant', km: 214 },
  { name: 'Cauringan / Artacho / Agat', km: 216 },
  { name: 'Esperanza / Udiao', km: 218 },
  { name: 'Saitan', km: 220 },
  { name: 'Rosario', km: 222, isTerminal: true },
  { name: 'Casilagan / Cuenca', km: 225 },
  { name: 'San Luis', km: 227 },
  { name: 'Maoasoas', km: 229 },
  { name: 'Ambangonan', km: 230 },
  { name: 'Ambelete', km: 232 },
  { name: 'Pugo Crossing', km: 235 },
  { name: 'Palina', km: 241 },
  { name: 'Salpang Taloy', km: 246 },
  { name: 'Realiza / Tafarmco Taloy', km: 251 },
  { name: 'Bayacsan / Baw-ek / Poyopoy', km: 256 },
  { name: 'Tuba Wilcon / Rockshed', km: 261 },
  { name: 'Baguio', km: 271, isTerminal: true }
];

const TARLAC_STOPS: Stop[] = [
  { name: 'Tarlac', km: 130, isTerminal: true },
  { name: 'Salapungan', km: 134 },
  { name: 'Aguso / Sta. Cruz', km: 137 },
  { name: 'Parsolingan', km: 139 },
  { name: 'Amacalan', km: 142 },
  { name: 'Gerona', km: 144 },
  { name: 'Magaspac', km: 146 },
  { name: 'Panique', km: 152 },
  { name: 'Sanjulian', km: 158 },
  { name: 'Moncada', km: 160 },
  { name: 'Sanpedro', km: 163 },
  { name: 'Colubot', km: 166 },
  { name: 'Sanmanuel', km: 168 },
  { name: 'Ligazpe / San Felipe', km: 171 },
  { name: 'San Agustin', km: 173 },
  { name: 'Salcedo', km: 175 },
  { name: 'Carmen', km: 177 },
  { name: 'Villasis', km: 179 },
  { name: 'Baccag', km: 183 },
  { name: 'Nancayasan', km: 185 },
  { name: 'Urdaneta', km: 187 },
  { name: 'Anonas', km: 191 },
  { name: 'Sumabnit', km: 194 },
  { name: 'Binalonan', km: 197 },
  { name: 'Vacante', km: 200 },
  { name: 'Rosario / Villa Pozzorubio', km: 203 },
  { name: 'Pozzorubio Bayan', km: 206 },
  { name: 'Batakil', km: 208 },
  { name: 'Sison NCC', km: 212 },
  { name: 'Sison Ice Plant', km: 214 },
  { name: 'Cauringan / Artacho / Agat', km: 216 },
  { name: 'Esperanza / Udiao', km: 218 },
  { name: 'Saitan', km: 220 },
  { name: 'Rosario', km: 222 },
  { name: 'Casilagan / Cuenca', km: 225 },
  { name: 'San Luis', km: 227 },
  { name: 'Maoasoas', km: 229 },
  { name: 'Ambangonan', km: 230 },
  { name: 'Ambelete', km: 232 },
  { name: 'Pugo Crossing', km: 235 },
  { name: 'Palina', km: 241 },
  { name: 'Salpang Taloy', km: 246 },
  { name: 'Realiza / Tafarmco Taloy', km: 251 },
  { name: 'Bayacsan / Baw-ek / Poyopoy', km: 256 },
  { name: 'Tuba Wilcon / Rockshed', km: 261 },
  { name: 'Baguio', km: 271, isTerminal: true }
];

const AIRCON_BAYAMBANG_STOPS: Stop[] = ORDINARY_BAYAMBANG_STOPS.map(stop => ({ ...stop }));

export const ROUTES: RouteProfile[] = [
  {
    id: ORDINARY_BAYAMBANG_ROUTE_ID,
    label: 'Ordinary Bayambang ↔ Baguio',
    shortLabel: 'Ordinary Bayambang',
    status: 'ready',
    stops: ORDINARY_BAYAMBANG_STOPS,
    fare: {
      regularRate: 2.2,
      discountRate: Number((2.2 * DISCOUNT_RATE_MULTIPLIER).toFixed(3)),
      minimumRegularFare: 22,
      minimumDiscountFare: 18,
      roundingMode: 'legacy',
      previousFare: {
        regularRate: 1.9,
        discountRate: Number((1.9 * DISCOUNT_RATE_MULTIPLIER).toFixed(3)),
        minimumRegularFare: 20,
        minimumDiscountFare: 16
      }
    }
  },
  {
    id: TARLAC_ROUTE_ID,
    label: 'Tarlac ↔ Baguio',
    shortLabel: 'Tarlac',
    status: 'ready',
    stops: TARLAC_STOPS,
    fare: {
      regularRate: 2.7,
      discountRate: Number((2.7 * DISCOUNT_RATE_MULTIPLIER).toFixed(3)),
      minimumRegularFare: 70,
      minimumDiscountFare: 56,
      roundingMode: 'standard'
    }
  },
  {
    id: CABANATUAN_ROUTE_ID,
    label: 'Cabanatuan ↔ Baguio',
    shortLabel: 'Cabanatuan',
    status: 'locked',
    lockedReason: 'Waiting for route data',
    stops: [],
    fare: {
      regularRate: 0,
      discountRate: 0,
      minimumRegularFare: 70,
      minimumDiscountFare: 56
    }
  },
  {
    id: CABANATUAN_VIA_SAN_JOSE_ROUTE_ID,
    label: 'Cabanatuan via San Jose ↔ Baguio',
    shortLabel: 'Cabanatuan via San Jose',
    status: 'locked',
    lockedReason: 'Waiting for route data',
    stops: [],
    fare: {
      regularRate: 0,
      discountRate: 0,
      minimumRegularFare: 70,
      minimumDiscountFare: 56
    }
  },
  {
    id: AIRCON_BAYAMBANG_ROUTE_ID,
    label: 'Aircon Bayambang ↔ Baguio',
    shortLabel: 'Aircon Bayambang',
    status: 'ready',
    stops: AIRCON_BAYAMBANG_STOPS,
    fare: {
      regularRate: 2.7,
      discountRate: Number((2.7 * DISCOUNT_RATE_MULTIPLIER).toFixed(3)),
      minimumRegularFare: 70,
      minimumDiscountFare: 56,
      roundingMode: 'standard'
    }
  }
];

export const getRouteById = (routeId: string) => ROUTES.find(route => route.id === routeId);

export const getReadyRouteById = (routeId: string) =>
  ROUTES.find(route => route.id === routeId && route.status === 'ready');

export const DEFAULT_ROUTE = getReadyRouteById(DEFAULT_ROUTE_ID) ?? ROUTES[0];

export const DEFAULT_SETTINGS: AppSettings = {
  fareVersion: FARE_SETTINGS_VERSION,
  activeRouteId: DEFAULT_ROUTE.id,
  hasAssignedRoute: false,
  regularRate: DEFAULT_ROUTE.fare.regularRate,
  discountRate: DEFAULT_ROUTE.fare.discountRate,
  isNightMode: false,
  conductorMode: true
};
