import type { AppSettings, RouteProfile, Stop } from './types';

export const FARE_SETTINGS_VERSION = 6;
export const DISCOUNT_RATE_MULTIPLIER = 0.8;
export const VICE_VERSA = '\u2194';

export const ORDINARY_BAYAMBANG_ROUTE_ID = 'ordinary-bayambang-baguio';
export const AIRCON_BAYAMBANG_ROUTE_ID = 'aircon-bayambang-baguio';
export const TARLAC_ROUTE_ID = 'tarlac-baguio';
export const CABANATUAN_ROUTE_ID = 'cabanatuan-baguio';
export const CABANATUAN_VIA_SAN_JOSE_ROUTE_ID = 'cabanatuan-via-san-jose-baguio';
export const CABANATUAN_VIA_TARLAC_ROUTE_ID = 'cabanatuan-via-tarlac-baguio';
export const DEFAULT_ROUTE_ID = ORDINARY_BAYAMBANG_ROUTE_ID;

const BAYAMBANG_STOP_COORDINATES: Record<number, { latitude: number; longitude: number }> = {
  152: { latitude: 15.8115, longitude: 120.4539 },
  160: { latitude: 15.8361, longitude: 120.477 },
  163: { latitude: 15.8554, longitude: 120.4932 },
  164: { latitude: 15.8455, longitude: 120.5095 },
  167: { latitude: 15.8481, longitude: 120.5235 },
  171: { latitude: 15.8582, longitude: 120.5582 },
  175: { latitude: 15.8821, longitude: 120.5841 },
  177: { latitude: 15.8894, longitude: 120.5901 },
  179: { latitude: 15.9015, longitude: 120.5883 },
  183: { latitude: 15.9357, longitude: 120.5912 },
  185: { latitude: 15.951, longitude: 120.5768 },
  187: { latitude: 15.9758, longitude: 120.5707 },
  191: { latitude: 15.9921, longitude: 120.5826 },
  194: { latitude: 16.0244, longitude: 120.5768 },
  197: { latitude: 16.0536, longitude: 120.6085 },
  200: { latitude: 16.0865, longitude: 120.5826 },
  203: { latitude: 16.1164, longitude: 120.5432 },
  206: { latitude: 16.1098, longitude: 120.5428 },
  208: { latitude: 16.1437, longitude: 120.5193 },
  212: { latitude: 16.1738, longitude: 120.5117 },
  214: { latitude: 16.1822, longitude: 120.5125 },
  216: { latitude: 16.1866, longitude: 120.5135 },
  218: { latitude: 16.2147, longitude: 120.502 },
  220: { latitude: 16.2415, longitude: 120.4886 },
  222: { latitude: 16.2295, longitude: 120.4878 },
  225: { latitude: 16.2552, longitude: 120.4891 },
  227: { latitude: 16.3245, longitude: 120.4772 },
  229: { latitude: 16.3312, longitude: 120.4795 },
  230: { latitude: 16.3059, longitude: 120.4905 },
  232: { latitude: 16.315, longitude: 120.488 },
  235: { latitude: 16.3268, longitude: 120.4718 },
  241: { latitude: 16.345, longitude: 120.5512 },
  246: { latitude: 16.3548, longitude: 120.4914 },
  251: { latitude: 16.3781, longitude: 120.5081 },
  256: { latitude: 16.3685, longitude: 120.5832 },
  261: { latitude: 16.3475, longitude: 120.591 },
  271: { latitude: 16.4123, longitude: 120.5945 }
};

const withCoordinates = (stops: Stop[]) =>
  stops.map(stop => ({
    ...stop,
    ...(BAYAMBANG_STOP_COORDINATES[stop.km] ?? {})
  }));

const COMMON_BAGUIO_STOPS: Stop[] = [
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

const ORDINARY_BAYAMBANG_STOPS: Stop[] = withCoordinates([
  { name: 'Bayambang', km: 152, isTerminal: true },
  { name: 'Bautista', km: 160 },
  { name: 'Anulid', km: 163 },
  { name: 'Laoac', km: 164 },
  { name: 'Alcala Bayan', km: 167 },
  { name: 'Kisikis / Pindangan', km: 171 },
  { name: 'Sto. Tomas', km: 175 },
  ...COMMON_BAGUIO_STOPS.map(stop => ({ ...stop }))
]);

const AIRCON_BAYAMBANG_STOPS: Stop[] = withCoordinates([
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
]);

const TARLAC_STOPS: Stop[] = [
  { name: 'Tarlac', km: 130, isTerminal: true },
  { name: 'Salapungan', km: 134 },
  { name: 'Aguso / Sta. Cruz', km: 137 },
  { name: 'Parsolingan', km: 139 },
  { name: 'Amacalan', km: 142 },
  { name: 'Gerona', km: 144 },
  { name: 'Magaspac', km: 146 },
  { name: 'Panique', km: 152 },
  { name: 'San Julian', km: 158 },
  { name: 'Moncada', km: 160 },
  { name: 'San Pedro', km: 163 },
  { name: 'Colubot', km: 166 },
  { name: 'San Manuel', km: 168 },
  { name: 'Legaspi / San Felipe', km: 171 },
  { name: 'San Agustin', km: 173 },
  { name: 'Salcedo', km: 175 },
  ...COMMON_BAGUIO_STOPS.map(stop => ({ ...stop }))
];

const CABANATUAN_VIA_SAN_JOSE_STOPS: Stop[] = [
  { name: 'Cabanatuan', km: 71, isTerminal: true },
  { name: 'Sto. Nino', km: 125 },
  { name: 'San Isidro', km: 127 },
  { name: 'Balbalungao', km: 131 },
  { name: 'Cordero', km: 135 },
  { name: 'Zenzo', km: 136 },
  { name: 'Lupao', km: 138 },
  { name: 'San Roque', km: 141 },
  { name: 'Maseil-seil', km: 143 },
  { name: 'Sta. Catalina College', km: 145 },
  { name: 'San Montano', km: 146 },
  { name: 'Umingan', km: 149 },
  { name: 'Pamienta', km: 151 },
  { name: 'Lubong Elem. School', km: 152 },
  { name: 'Sta. Maria', km: 154 },
  { name: 'Gonsalez', km: 157 },
  { name: 'Cabaruan', km: 160 },
  { name: 'San Andres', km: 162 },
  { name: 'San Leon', km: 163 },
  { name: 'Balunggao', km: 168 },
  { name: 'Bakit-bakit', km: 170 },
  { name: 'Rosales', km: 173 },
  { name: 'Tomana', km: 175 },
  { name: 'Carmen', km: 177 },
  { name: 'Villasis', km: 179 },
  { name: 'Baccag / Wilcon / McDo', km: 183 },
  { name: 'Nancayasan', km: 185 },
  { name: 'Urdaneta / PSU / Bypass', km: 187 },
  { name: 'Anonas / Tabuyok', km: 191 },
  { name: 'Sumabnit / Tulong / Tangke', km: 194 },
  { name: 'Binalonan / Sili', km: 197 },
  { name: 'Vacante / Bugayong', km: 200 },
  { name: 'Rosario / Villa Pozzorubio', km: 203 },
  { name: 'Pozzorubio Bayan', km: 206 },
  { name: 'Batakil', km: 208 },
  { name: 'Sison NCC', km: 212 },
  { name: 'Sison Ice Plant', km: 214 },
  { name: 'Cauringan / Artacho / Agat', km: 216 },
  { name: 'Esperanza / Udiao', km: 218 },
  { name: 'Saitan / Jollibee', km: 220 },
  { name: 'Rosario / Alipang / Inabaan', km: 222 },
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

const CABANATUAN_VIA_TARLAC_STOPS: Stop[] = [
  { name: 'Cabanatuan', km: 76, isTerminal: true },
  { name: 'Sta. Rosa', km: 89 },
  { name: 'Lafuente', km: 92 },
  { name: 'Inspector / Rajal', km: 94 },
  { name: 'Carmen (99)', km: 99 },
  { name: 'Zaragosa', km: 104 },
  { name: 'Control', km: 107 },
  { name: 'Lapaz', km: 111 },
  { name: 'Caramutan', km: 113 },
  { name: 'Lawang Cupang', km: 115 },
  { name: 'Amucao', km: 118 },
  { name: 'Balingcanaway', km: 120 },
  { name: 'San Manuel (123)', km: 123 },
  { name: 'San Jose', km: 125 },
  { name: 'Maliwalo', km: 128 },
  { name: 'Tarlac', km: 130 },
  { name: 'Salapungan', km: 134 },
  { name: 'Aguso / Sta. Cruz', km: 137 },
  { name: 'Parsolingan', km: 139 },
  { name: 'Amacalan', km: 142 },
  { name: 'Gerona', km: 144 },
  { name: 'Magaspac', km: 146 },
  { name: 'Panique', km: 152 },
  { name: 'San Julian', km: 158 },
  { name: 'Moncada', km: 160 },
  { name: 'San Pedro', km: 165 },
  { name: 'Colubet', km: 166 },
  { name: 'San Manuel (168)', km: 168 },
  { name: 'Legaspi', km: 171 },
  { name: 'San Agustin', km: 173 },
  { name: 'Salcedo', km: 175 },
  { name: 'Carmen (177)', km: 177 },
  { name: 'Villasis', km: 179 },
  { name: 'Baccag / Wilcon / McDo', km: 183 },
  { name: 'Nancayasan', km: 185 },
  { name: 'Urdaneta / PSU / Bypass', km: 187 },
  { name: 'Anonas / Tabuyok', km: 191 },
  { name: 'Sumabnit / Tulong / Tangke', km: 194 },
  { name: 'Binalonan / Sili', km: 197 },
  { name: 'Vacante / Bugayong', km: 200 },
  { name: 'Rosario / Villa Pozzorubio', km: 203 },
  { name: 'Pozzorubio Bayan', km: 206 },
  { name: 'Batakil', km: 208 },
  { name: 'Sison NCC', km: 212 },
  { name: 'Sison Ice Plant', km: 214 },
  { name: 'Cauringan / Artacho / Agat', km: 216 },
  { name: 'Esperanza / Udiao', km: 218 },
  { name: 'Saitan / Jollibee', km: 220 },
  { name: 'Rosario / Alipang / Inabaan', km: 222 },
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

const createLabel = (label: string) => `${label} ${VICE_VERSA} Baguio`;

export const ROUTES: RouteProfile[] = [
  {
    id: ORDINARY_BAYAMBANG_ROUTE_ID,
    label: createLabel('Ordinary Bayambang'),
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
    id: AIRCON_BAYAMBANG_ROUTE_ID,
    label: createLabel('Aircon Bayambang'),
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
  },
  {
    id: TARLAC_ROUTE_ID,
    label: createLabel('Tarlac'),
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
    label: createLabel('Cabanatuan'),
    shortLabel: 'Cabanatuan',
    status: 'locked',
    lockedReason: 'Waiting for route data',
    stops: [],
    fare: {
      regularRate: 0,
      discountRate: 0,
      minimumRegularFare: 70,
      minimumDiscountFare: 56,
      roundingMode: 'standard'
    }
  },
  {
    id: CABANATUAN_VIA_SAN_JOSE_ROUTE_ID,
    label: createLabel('Cabanatuan via San Jose'),
    shortLabel: 'Cab via San Jose',
    status: 'ready',
    stops: CABANATUAN_VIA_SAN_JOSE_STOPS,
    fare: {
      regularRate: 2.7,
      discountRate: Number((2.7 * DISCOUNT_RATE_MULTIPLIER).toFixed(3)),
      minimumRegularFare: 70,
      minimumDiscountFare: 56,
      roundingMode: 'standard'
    }
  },
  {
    id: CABANATUAN_VIA_TARLAC_ROUTE_ID,
    label: createLabel('Cabanatuan via Tarlac'),
    shortLabel: 'Cab via Tarlac',
    status: 'ready',
    stops: CABANATUAN_VIA_TARLAC_STOPS,
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
