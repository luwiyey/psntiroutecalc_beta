import type { AppSettings, RouteProfile, Stop } from './types';

export const FARE_SETTINGS_VERSION = 8;
export const DISCOUNT_RATE_MULTIPLIER = 0.8;
export const VICE_VERSA = '\u2194';

export const ORDINARY_BAYAMBANG_ROUTE_ID = 'ordinary-bayambang-baguio';
export const AIRCON_BAYAMBANG_ROUTE_ID = 'aircon-bayambang-baguio';
export const TARLAC_ROUTE_ID = 'tarlac-baguio';
export const CABANATUAN_ROUTE_ID = 'cabanatuan-baguio';
export const CABANATUAN_VIA_SAN_JOSE_ROUTE_ID = 'cabanatuan-via-san-jose-baguio';
export const CABANATUAN_VIA_TARLAC_ROUTE_ID = 'cabanatuan-via-tarlac-baguio';
export const DEFAULT_ROUTE_ID = ORDINARY_BAYAMBANG_ROUTE_ID;

const BAGUIO_KM = 271;

interface StopSeed {
  km: number;
  name: string;
  coverageRange: string;
  latitude: number;
  longitude: number;
  isTerminal?: boolean;
  aliases?: string[];
}

const buildStops = (seeds: StopSeed[]): Stop[] =>
  seeds.map(seed => ({
    name: seed.name,
    km: seed.km,
    coverageRange: seed.coverageRange,
    latitude: seed.latitude,
    longitude: seed.longitude,
    distanceToBaguio: Math.max(0, BAGUIO_KM - seed.km),
    ...(seed.isTerminal ? { isTerminal: true } : {}),
    ...(seed.aliases?.length ? { aliases: seed.aliases } : {})
  }));

const COMMON_BAGUIO_CORRIDOR_SEEDS: StopSeed[] = [
  {
    km: 177,
    name: 'Carmen (Rosales)',
    coverageRange: '176.1 - 178.0',
    latitude: 15.8894,
    longitude: 120.5901,
    isTerminal: true,
    aliases: ['Carmen']
  },
  {
    km: 179,
    name: 'Villasis',
    coverageRange: '178.1 - 181.0',
    latitude: 15.9015,
    longitude: 120.5883
  },
  {
    km: 183,
    name: 'Baccag (Wilcon / McDo)',
    coverageRange: '181.1 - 184.0',
    latitude: 15.9357,
    longitude: 120.5912,
    aliases: ['Baccag', 'Baccag / Wilcon / McDo']
  },
  {
    km: 185,
    name: 'Nancayasan',
    coverageRange: '184.1 - 186.0',
    latitude: 15.951,
    longitude: 120.5768
  },
  {
    km: 187,
    name: 'Urdaneta (PSU / Bypass)',
    coverageRange: '186.1 - 189.0',
    latitude: 15.9882,
    longitude: 120.5736,
    isTerminal: true,
    aliases: ['Urdaneta City', 'Urdaneta / PSU / Bypass']
  },
  {
    km: 191,
    name: 'Anonas / Tabuyoc',
    coverageRange: '189.1 - 192.5',
    latitude: 15.9921,
    longitude: 120.5826,
    aliases: ['Anonas', 'Anonas / Tabuyok']
  },
  {
    km: 194,
    name: 'Sumabnit / Tulong',
    coverageRange: '192.6 - 195.5',
    latitude: 16.0244,
    longitude: 120.5768,
    aliases: ['Sumabnit', 'Sumabnit / Tulong / Tangke']
  },
  {
    km: 197,
    name: 'Binalonan / Sili',
    coverageRange: '195.6 - 198.5',
    latitude: 16.0536,
    longitude: 120.6085
  },
  {
    km: 200,
    name: 'Vacante / Bugayong',
    coverageRange: '198.6 - 201.5',
    latitude: 16.0865,
    longitude: 120.5826
  },
  {
    km: 203,
    name: 'Rosario / Villa Pozzorubio',
    coverageRange: '201.6 - 204.5',
    latitude: 16.1164,
    longitude: 120.5432,
    aliases: ['Rosario / Pozzorubio', 'Rosario / Villa Pozzo']
  },
  {
    km: 206,
    name: 'Pozzorubio Bayan',
    coverageRange: '204.6 - 207.0',
    latitude: 16.1098,
    longitude: 120.5428
  },
  {
    km: 208,
    name: 'Batakil',
    coverageRange: '207.1 - 210.0',
    latitude: 16.1437,
    longitude: 120.5193
  },
  {
    km: 212,
    name: 'Sison NCC',
    coverageRange: '210.1 - 213.0',
    latitude: 16.1738,
    longitude: 120.5117
  },
  {
    km: 214,
    name: 'Sison Ice Plant',
    coverageRange: '213.1 - 215.0',
    latitude: 16.1822,
    longitude: 120.5125,
    aliases: ['Sison Ice plant']
  },
  {
    km: 216,
    name: 'Cauringan / Artacho / Agat',
    coverageRange: '215.1 - 217.0',
    latitude: 16.1866,
    longitude: 120.5135,
    aliases: ['Cauringan / Agat', 'Cauringan/Agat']
  },
  {
    km: 218,
    name: 'Esperanza / Udiao',
    coverageRange: '217.1 - 219.0',
    latitude: 16.2147,
    longitude: 120.502
  },
  {
    km: 220,
    name: 'Saitan / Jollibee',
    coverageRange: '219.1 - 221.0',
    latitude: 16.2415,
    longitude: 120.4886,
    aliases: ['Saitan', 'Saitan (Jollibee area)']
  },
  {
    km: 222,
    name: 'Rosario (La Union)',
    coverageRange: '221.1 - 223.5',
    latitude: 16.2295,
    longitude: 120.4878,
    isTerminal: true,
    aliases: ['Rosario / Alipang / Inabaan', 'Rosario / Inabaan', 'Rosario']
  },
  {
    km: 225,
    name: 'Casilagan / Cuenca',
    coverageRange: '223.6 - 226.0',
    latitude: 16.2552,
    longitude: 120.4891
  },
  {
    km: 227,
    name: 'San Luis',
    coverageRange: '226.1 - 228.0',
    latitude: 16.3245,
    longitude: 120.4772
  },
  {
    km: 229,
    name: 'Maoasoas',
    coverageRange: '228.1 - 229.5',
    latitude: 16.3312,
    longitude: 120.4795,
    aliases: ['Mauasuas']
  },
  {
    km: 230,
    name: 'Ambangonan',
    coverageRange: '229.6 - 231.0',
    latitude: 16.3059,
    longitude: 120.4905
  },
  {
    km: 232,
    name: 'Ambelete',
    coverageRange: '231.1 - 233.5',
    latitude: 16.315,
    longitude: 120.488
  },
  {
    km: 235,
    name: 'Pugo Crossing',
    coverageRange: '233.6 - 238.0',
    latitude: 16.3268,
    longitude: 120.4718
  },
  {
    km: 241,
    name: 'Palina',
    coverageRange: '238.1 - 243.5',
    latitude: 16.345,
    longitude: 120.5512
  },
  {
    km: 246,
    name: 'Salpang, Taloy',
    coverageRange: '243.6 - 248.5',
    latitude: 16.3548,
    longitude: 120.4914,
    aliases: ['Salpang Taloy']
  },
  {
    km: 251,
    name: 'Realiza / TAFARMCO',
    coverageRange: '248.6 - 253.5',
    latitude: 16.3781,
    longitude: 120.5081,
    aliases: ['Realiza / Tafarmco', 'Realiza / Tafarmco Taloy']
  },
  {
    km: 256,
    name: 'Bayacsan / Bawek / Poyopoy',
    coverageRange: '253.6 - 258.5',
    latitude: 16.3685,
    longitude: 120.5832,
    aliases: ['Bayacsan / Baw-ek / Poyopoy']
  },
  {
    km: 261,
    name: 'Tuba / Rockshed',
    coverageRange: '258.6 - 266.0',
    latitude: 16.3475,
    longitude: 120.591,
    aliases: ['Tuba Wilcon / Rockshed', 'Tuba/ Rockshed']
  },
  {
    km: 271,
    name: 'Baguio',
    coverageRange: '266.1 - End',
    latitude: 16.4123,
    longitude: 120.5945,
    isTerminal: true
  }
];

const ORDINARY_BAYAMBANG_STOPS: Stop[] = buildStops([
  {
    km: 152,
    name: 'Bayambang',
    coverageRange: 'Start - 156.0',
    latitude: 15.8115,
    longitude: 120.4539,
    isTerminal: true,
    aliases: ['Bayambang (Proper)']
  },
  {
    km: 160,
    name: 'Bautista',
    coverageRange: '156.1 - 161.5',
    latitude: 15.8361,
    longitude: 120.477,
    aliases: ['Bautista (Proper)']
  },
  {
    km: 163,
    name: 'Anulid',
    coverageRange: '161.6 - 163.5',
    latitude: 15.8554,
    longitude: 120.4932
  },
  {
    km: 164,
    name: 'Laoac (Alcala)',
    coverageRange: '163.6 - 165.5',
    latitude: 15.8455,
    longitude: 120.5095,
    aliases: ['Laoac']
  },
  {
    km: 167,
    name: 'Alcala (Poblacion)',
    coverageRange: '165.6 - 169.0',
    latitude: 15.8481,
    longitude: 120.5235,
    aliases: ['Alcala Bayan', 'Alacala Bayan']
  },
  {
    km: 171,
    name: 'Kisikis / Pindangan',
    coverageRange: '169.1 - 173.0',
    latitude: 15.8582,
    longitude: 120.5582
  },
  {
    km: 175,
    name: 'Sto. Tomas',
    coverageRange: '173.1 - 176.0',
    latitude: 15.8821,
    longitude: 120.5841
  },
  ...COMMON_BAGUIO_CORRIDOR_SEEDS
]);

const AIRCON_BAYAMBANG_STOPS: Stop[] = buildStops([
  {
    km: 152,
    name: 'Bayambang',
    coverageRange: 'Start - 156.0',
    latitude: 15.8115,
    longitude: 120.4539,
    isTerminal: true,
    aliases: ['Bayambang (Proper)']
  },
  {
    km: 160,
    name: 'Bautista',
    coverageRange: '156.1 - 161.5',
    latitude: 15.8361,
    longitude: 120.477,
    aliases: ['Bautista (Proper)']
  },
  {
    km: 163,
    name: 'Anulid',
    coverageRange: '161.6 - 163.5',
    latitude: 15.8554,
    longitude: 120.4932
  },
  {
    km: 164,
    name: 'Laoac (Alcala)',
    coverageRange: '163.6 - 165.5',
    latitude: 15.8455,
    longitude: 120.5095,
    aliases: ['Laoac']
  },
  {
    km: 167,
    name: 'Alcala (Poblacion)',
    coverageRange: '165.6 - 169.0',
    latitude: 15.8481,
    longitude: 120.5235,
    aliases: ['Alcala Bayan', 'Alacala Bayan']
  },
  {
    km: 171,
    name: 'Kisikis / Pindangan',
    coverageRange: '169.1 - 173.0',
    latitude: 15.8582,
    longitude: 120.5582
  },
  {
    km: 175,
    name: 'Sto. Tomas',
    coverageRange: '173.1 - 176.0',
    latitude: 15.8821,
    longitude: 120.5841
  },
  ...COMMON_BAGUIO_CORRIDOR_SEEDS
]);

const TARLAC_STOPS: Stop[] = buildStops([
  {
    km: 130,
    name: 'Tarlac City',
    coverageRange: 'Start - 132.0',
    latitude: 15.4828,
    longitude: 120.5904,
    isTerminal: true,
    aliases: ['Tarlac', 'Tarlac City (Proper)']
  },
  {
    km: 134,
    name: 'Salapungan',
    coverageRange: '132.1 - 135.5',
    latitude: 15.5938,
    longitude: 120.6125
  },
  {
    km: 137,
    name: 'Aguso / Sta. Cruz',
    coverageRange: '135.6 - 138.0',
    latitude: 15.5264,
    longitude: 120.5946
  },
  {
    km: 139,
    name: 'Parsolingan',
    coverageRange: '138.1 - 140.5',
    latitude: 15.5563,
    longitude: 120.6006
  },
  {
    km: 142,
    name: 'Amacalan',
    coverageRange: '140.6 - 143.0',
    latitude: 15.5865,
    longitude: 120.6117
  },
  {
    km: 144,
    name: 'Gerona',
    coverageRange: '143.1 - 145.0',
    latitude: 15.6031,
    longitude: 120.5985
  },
  {
    km: 146,
    name: 'Magaspac',
    coverageRange: '145.1 - 149.0',
    latitude: 15.6152,
    longitude: 120.5974
  },
  {
    km: 152,
    name: 'Paniqui',
    coverageRange: '149.1 - 155.0',
    latitude: 15.6664,
    longitude: 120.5815,
    aliases: ['Panique']
  },
  {
    km: 158,
    name: 'San Julian',
    coverageRange: '155.1 - 159.0',
    latitude: 15.7187,
    longitude: 120.5849,
    aliases: ['Sanjulian']
  },
  {
    km: 160,
    name: 'Moncada',
    coverageRange: '159.1 - 161.5',
    latitude: 15.7336,
    longitude: 120.5885
  },
  {
    km: 163,
    name: 'San Pedro',
    coverageRange: '161.6 - 164.5',
    latitude: 15.7642,
    longitude: 120.5913,
    aliases: ['Sanpedro']
  },
  {
    km: 166,
    name: 'Colubot',
    coverageRange: '164.6 - 167.0',
    latitude: 15.7899,
    longitude: 120.6028,
    aliases: ['Colubet']
  },
  {
    km: 168,
    name: 'San Manuel',
    coverageRange: '167.1 - 169.5',
    latitude: 15.8041,
    longitude: 120.6024
  },
  {
    km: 171,
    name: 'Legaspi / San Felipe',
    coverageRange: '169.6 - 172.0',
    latitude: 15.8188,
    longitude: 120.6065,
    aliases: ['Ligazpe / San Felipe']
  },
  {
    km: 173,
    name: 'San Agustin',
    coverageRange: '172.1 - 174.0',
    latitude: 15.8248,
    longitude: 120.6105
  },
  {
    km: 175,
    name: 'Salcedo',
    coverageRange: '174.1 - 176.0',
    latitude: 15.8341,
    longitude: 120.6133
  },
  ...COMMON_BAGUIO_CORRIDOR_SEEDS
]);

const CABANATUAN_VIA_SAN_JOSE_STOPS: Stop[] = buildStops([
  {
    km: 71,
    name: 'Cabanatuan',
    coverageRange: 'Start - 98.0',
    latitude: 15.4847,
    longitude: 120.9674,
    isTerminal: true
  },
  {
    km: 125,
    name: 'Sto. Niño',
    coverageRange: '98.1 - 126.0',
    latitude: 15.7958,
    longitude: 120.9321,
    aliases: ['Sto. Nino', 'Sto.nino']
  },
  {
    km: 127,
    name: 'San Isidro',
    coverageRange: '126.1 - 129.0',
    latitude: 15.8238,
    longitude: 120.9385
  },
  {
    km: 131,
    name: 'Balbalungao',
    coverageRange: '129.1 - 133.0',
    latitude: 15.8515,
    longitude: 120.9446
  },
  {
    km: 135,
    name: 'Cordero',
    coverageRange: '133.1 - 135.5',
    latitude: 15.8672,
    longitude: 120.9154
  },
  {
    km: 136,
    name: 'Zenzo',
    coverageRange: '135.6 - 137.0',
    latitude: 15.8715,
    longitude: 120.908
  },
  {
    km: 138,
    name: 'Lupao',
    coverageRange: '137.1 - 139.5',
    latitude: 15.8782,
    longitude: 120.8993
  },
  {
    km: 141,
    name: 'San Roque',
    coverageRange: '139.6 - 142.0',
    latitude: 15.9015,
    longitude: 120.8912
  },
  {
    km: 143,
    name: 'Maseil-seil',
    coverageRange: '142.1 - 144.0',
    latitude: 15.9189,
    longitude: 120.8815
  },
  {
    km: 145,
    name: 'Sta. Catalina College',
    coverageRange: '144.1 - 145.5',
    latitude: 15.922,
    longitude: 120.871
  },
  {
    km: 146,
    name: 'San Montano',
    coverageRange: '145.6 - 147.5',
    latitude: 15.9245,
    longitude: 120.865
  },
  {
    km: 149,
    name: 'Umingan',
    coverageRange: '147.6 - 150.0',
    latitude: 15.926,
    longitude: 120.8413
  },
  {
    km: 151,
    name: 'Pamienta',
    coverageRange: '150.1 - 151.5',
    latitude: 15.9275,
    longitude: 120.825
  },
  {
    km: 152,
    name: 'Lubong Elem. School',
    coverageRange: '151.6 - 153.0',
    latitude: 15.9269,
    longitude: 120.8086
  },
  {
    km: 154,
    name: 'Sta. Maria',
    coverageRange: '153.1 - 155.5',
    latitude: 15.918,
    longitude: 120.782
  },
  {
    km: 157,
    name: 'Gonsalez',
    coverageRange: '155.6 - 158.5',
    latitude: 15.905,
    longitude: 120.735
  },
  {
    km: 160,
    name: 'Cabaruan',
    coverageRange: '158.6 - 161.0',
    latitude: 15.898,
    longitude: 120.712
  },
  {
    km: 162,
    name: 'San Andres',
    coverageRange: '161.1 - 162.5',
    latitude: 15.897,
    longitude: 120.695
  },
  {
    km: 163,
    name: 'San Leon',
    coverageRange: '162.6 - 165.5',
    latitude: 15.8965,
    longitude: 120.688
  },
  {
    km: 168,
    name: 'Balungao',
    coverageRange: '165.6 - 169.0',
    latitude: 15.8974,
    longitude: 120.6723
  },
  {
    km: 170,
    name: 'Bakit-Bakit',
    coverageRange: '169.1 - 171.5',
    latitude: 15.8959,
    longitude: 120.6531,
    aliases: ['Bakit-bakit']
  },
  {
    km: 173,
    name: 'Rosales',
    coverageRange: '171.6 - 174.0',
    latitude: 15.8613,
    longitude: 120.6315
  },
  {
    km: 175,
    name: 'Tomana',
    coverageRange: '174.1 - 176.0',
    latitude: 15.885,
    longitude: 120.605
  },
  ...COMMON_BAGUIO_CORRIDOR_SEEDS
]);

const CABANATUAN_VIA_TARLAC_STOPS: Stop[] = buildStops([
  {
    km: 76,
    name: 'Cabanatuan',
    coverageRange: 'Start - 82.5',
    latitude: 15.4847,
    longitude: 120.9674,
    isTerminal: true
  },
  {
    km: 89,
    name: 'Sta. Rosa',
    coverageRange: '82.6 - 90.5',
    latitude: 15.4245,
    longitude: 120.9405
  },
  {
    km: 92,
    name: 'Lafuente',
    coverageRange: '90.6 - 93.0',
    latitude: 15.4385,
    longitude: 120.898
  },
  {
    km: 94,
    name: 'Inspector / Rajal',
    coverageRange: '93.1 - 96.5',
    latitude: 15.441,
    longitude: 120.88,
    aliases: ['Inspector, Rajal']
  },
  {
    km: 99,
    name: 'Carmen (Zaragoza)',
    coverageRange: '96.6 - 101.5',
    latitude: 15.4485,
    longitude: 120.825,
    aliases: ['Carmen']
  },
  {
    km: 104,
    name: 'Zaragoza',
    coverageRange: '101.6 - 105.5',
    latitude: 15.4475,
    longitude: 120.7935,
    aliases: ['Zaragosa']
  },
  {
    km: 107,
    name: 'Control',
    coverageRange: '105.6 - 109.0',
    latitude: 15.446,
    longitude: 120.765
  },
  {
    km: 111,
    name: 'La Paz',
    coverageRange: '109.1 - 112.0',
    latitude: 15.4425,
    longitude: 120.728,
    aliases: ['Lapaz']
  },
  {
    km: 113,
    name: 'Caramutan',
    coverageRange: '112.1 - 114.0',
    latitude: 15.449,
    longitude: 120.702
  },
  {
    km: 115,
    name: 'Lawang Cupang',
    coverageRange: '114.1 - 116.5',
    latitude: 15.452,
    longitude: 120.685,
    aliases: ['Lawang cupang']
  },
  {
    km: 118,
    name: 'Amucao',
    coverageRange: '116.6 - 119.0',
    latitude: 15.4625,
    longitude: 120.655
  },
  {
    km: 120,
    name: 'Balingcanaway',
    coverageRange: '119.1 - 121.5',
    latitude: 15.468,
    longitude: 120.638,
    aliases: ['Balingkanaway']
  },
  {
    km: 123,
    name: 'San Manuel (Tarlac City)',
    coverageRange: '121.6 - 124.0',
    latitude: 15.474,
    longitude: 120.618,
    aliases: ['San Manuel']
  },
  {
    km: 125,
    name: 'San Jose (Tarlac)',
    coverageRange: '124.1 - 126.5',
    latitude: 15.4785,
    longitude: 120.605,
    aliases: ['San Jose']
  },
  {
    km: 128,
    name: 'Maliwalo',
    coverageRange: '126.6 - 129.0',
    latitude: 15.4835,
    longitude: 120.6
  },
  {
    km: 130,
    name: 'Tarlac City',
    coverageRange: '129.1 - 132.0',
    latitude: 15.4828,
    longitude: 120.5904,
    aliases: ['Tarlac', 'Tarlac City (Proper)']
  },
  {
    km: 134,
    name: 'Salapungan',
    coverageRange: '132.1 - 135.5',
    latitude: 15.5938,
    longitude: 120.6125
  },
  {
    km: 137,
    name: 'Aguso / Sta. Cruz',
    coverageRange: '135.6 - 138.0',
    latitude: 15.5264,
    longitude: 120.5946
  },
  {
    km: 139,
    name: 'Parsolingan',
    coverageRange: '138.1 - 140.5',
    latitude: 15.5563,
    longitude: 120.6006
  },
  {
    km: 142,
    name: 'Amacalan',
    coverageRange: '140.6 - 143.0',
    latitude: 15.5865,
    longitude: 120.6117
  },
  {
    km: 144,
    name: 'Gerona',
    coverageRange: '143.1 - 145.0',
    latitude: 15.6031,
    longitude: 120.5985
  },
  {
    km: 146,
    name: 'Magaspac',
    coverageRange: '145.1 - 149.0',
    latitude: 15.6152,
    longitude: 120.5974
  },
  {
    km: 152,
    name: 'Paniqui',
    coverageRange: '149.1 - 155.0',
    latitude: 15.6664,
    longitude: 120.5815,
    aliases: ['Panique']
  },
  {
    km: 158,
    name: 'San Julian',
    coverageRange: '155.1 - 159.0',
    latitude: 15.7187,
    longitude: 120.5849,
    aliases: ['Sanjulian']
  },
  {
    km: 160,
    name: 'Moncada',
    coverageRange: '159.1 - 162.5',
    latitude: 15.7336,
    longitude: 120.5885
  },
  {
    km: 165,
    name: 'San Pedro',
    coverageRange: '162.6 - 165.5',
    latitude: 15.7642,
    longitude: 120.5913,
    aliases: ['Sanpedro']
  },
  {
    km: 166,
    name: 'Colubot',
    coverageRange: '165.6 - 167.0',
    latitude: 15.7899,
    longitude: 120.6028,
    aliases: ['Colubet']
  },
  {
    km: 168,
    name: 'San Manuel (Proper)',
    coverageRange: '167.1 - 169.5',
    latitude: 15.8041,
    longitude: 120.6024,
    aliases: ['San Manuel']
  },
  {
    km: 171,
    name: 'Legaspi',
    coverageRange: '169.6 - 172.0',
    latitude: 15.8188,
    longitude: 120.6065,
    aliases: ['Ligazpe']
  },
  {
    km: 173,
    name: 'San Agustin',
    coverageRange: '172.1 - 174.0',
    latitude: 15.8248,
    longitude: 120.6105
  },
  {
    km: 175,
    name: 'Salcedo',
    coverageRange: '174.1 - 176.0',
    latitude: 15.8341,
    longitude: 120.6133
  },
  ...COMMON_BAGUIO_CORRIDOR_SEEDS
]);

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
      minimumRegularFare: 20,
      minimumDiscountFare: 16,
      roundingMode: 'legacy'
    }
  },
  {
    id: AIRCON_BAYAMBANG_ROUTE_ID,
    label: createLabel('Aircon Bayambang'),
    shortLabel: 'Aircon Bayambang',
    status: 'ready',
    stops: AIRCON_BAYAMBANG_STOPS,
    fare: {
      regularRate: 2.5,
      discountRate: Number((2.5 * DISCOUNT_RATE_MULTIPLIER).toFixed(3)),
      minimumRegularFare: 60,
      minimumDiscountFare: 48,
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
      regularRate: 2.5,
      discountRate: Number((2.5 * DISCOUNT_RATE_MULTIPLIER).toFixed(3)),
      minimumRegularFare: 60,
      minimumDiscountFare: 48,
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
      regularRate: 2.5,
      discountRate: Number((2.5 * DISCOUNT_RATE_MULTIPLIER).toFixed(3)),
      minimumRegularFare: 60,
      minimumDiscountFare: 48,
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
      regularRate: 2.5,
      discountRate: Number((2.5 * DISCOUNT_RATE_MULTIPLIER).toFixed(3)),
      minimumRegularFare: 60,
      minimumDiscountFare: 48,
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
