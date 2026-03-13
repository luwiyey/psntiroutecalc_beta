
import type { AppSettings, Stop } from './types';

export const FARE_SETTINGS_VERSION = 4;
export const ORDINARY_FARE_PER_KM = 2.2;
export const DISCOUNT_RATE_MULTIPLIER = 0.8;
export const MIN_REGULAR_FARE = 22;
export const MIN_DISCOUNT_FARE = 18;
export const PREVIOUS_ORDINARY_FARE_PER_KM = 1.9;
export const PREVIOUS_MIN_REGULAR_FARE = 20;

export const STOPS: Stop[] = [
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

export const DEFAULT_SETTINGS: AppSettings = {
  fareVersion: FARE_SETTINGS_VERSION,
  regularRate: ORDINARY_FARE_PER_KM,
  discountRate: Number((ORDINARY_FARE_PER_KM * DISCOUNT_RATE_MULTIPLIER).toFixed(3)),
  isNightMode: false,
  conductorMode: true
};
