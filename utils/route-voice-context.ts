import { AIRCON_BAYAMBANG_ROUTE_ID, ORDINARY_BAYAMBANG_ROUTE_ID } from '../constants';

export interface RouteStopVoiceContext {
  aliases: string[];
  locationLabel?: string;
}

const BAYAMBANG_BAGUIO_VOICE_CONTEXT: Record<string, RouteStopVoiceContext> = {
  'Bayambang': {
    locationLabel: 'Poblacion, Bayambang, Pangasinan',
    aliases: ['Solid North Terminal', 'Bago Tulay', 'Poblacion Bayambang', 'Bayambang Pangasinan']
  },
  'Bautista': {
    locationLabel: 'Poblacion West, Bautista, Pangasinan',
    aliases: ['Bautista Plaza', 'Cabbuan Street', 'Nandacan Street', 'Bautista Pangasinan']
  },
  'Anulid': {
    locationLabel: 'Anulid, Alcala, Pangasinan',
    aliases: ['Zone 6', 'Anulid Plaza', 'Hebis Resort', 'Barangay Cacandongan', 'Cacandongan']
  },
  'Laoac (Alcala)': {
    locationLabel: 'Laoac, Alcala, Pangasinan',
    aliases: ['Laoac Junction', 'Laoac PCP', 'Laoac Alcala', 'Alcala Laoac']
  },
  'Alcala (Poblacion)': {
    locationLabel: 'Poblacion, Alcala, Pangasinan',
    aliases: ['Johannes Store', 'Golden Happy', 'Alcala Park', 'San Pedro Ili Manok', 'Alcala Pangasinan']
  },
  'Kisikis / Pindangan': {
    locationLabel: 'Kisikis and Pindangan, Alcala, Pangasinan',
    aliases: [
      'Kisikis Barangay Hall',
      'Santiago Street',
      'Pindangan West Arc',
      'Pindangan West Barangay Hall',
      'Pindangan East Court',
      'Pindangan East Barangay Hall',
      'Pindangan Bridge',
      'Kisikis Alcala',
      'Pindangan Alcala'
    ]
  },
  'Sto. Tomas': {
    locationLabel: 'Poblacion, Sto. Tomas, Pangasinan',
    aliases: [
      'San Antonio School',
      'San Antonio Barangay Hall',
      'San Antonio Quarry',
      'San Jose Elementary School',
      'San Jose Pascua Drug Store',
      'Saint Thomas Aquinas Parish Church',
      'Sto Tomas TGP',
      'Sto Tomas Plaza',
      'Salvacion Quarry',
      'Centrum Fuel Sto Tomas'
    ]
  },
  'Carmen (Rosales)': {
    locationLabel: 'Carmen East, Rosales, Pangasinan',
    aliases: ['SM City Rosales', 'Petron Rosales', 'Rosales East', 'Carmen Rosales']
  },
  'Villasis': {
    locationLabel: 'Poblacion, Villasis, Pangasinan',
    aliases: ['Pulay Baba ng Tulay', 'Bagsakan', 'Villasis Plaza', 'Ordonez Hospital', 'Lomboy Street']
  },
  'Baccag (Wilcon / McDo)': {
    locationLabel: 'Baccag, Villasis, Pangasinan',
    aliases: ['Wilcon Depot', 'Valdez College', '711 Baccag', 'McDonalds Baccag', 'Baccag Elementary School', 'Rusco Motors']
  },
  'Nancayasan': {
    locationLabel: 'Nancayasan, Urdaneta City, Pangasinan',
    aliases: ['Temple', 'AGL', 'Check Point', 'Petron Fuel', 'Sacred Heart Hospital', 'Nancayasan Urdaneta']
  },
  'Urdaneta (PSU / Bypass)': {
    locationLabel: 'San Vicente, Urdaneta City, Pangasinan',
    aliases: [
      'CSI Warehouse',
      'UPang',
      'SM Urdaneta',
      'CB Mall',
      'Lisland',
      'Sacred Heart',
      'PUNP College',
      'PSU College',
      'Jollibee Bypass',
      'Jollibee RCS',
      'Urdaneta City'
    ]
  },
  'Anonas / Tabuyoc': {
    locationLabel: 'Anonas and Tabuyoc, Urdaneta City, Pangasinan',
    aliases: ['Urdaneta City Hall', 'BIR', 'Centrum Fuel', 'Anonas Crossing', 'Tabuyoc']
  },
  'Sumabnit / Tulong': {
    locationLabel: 'Sumabnit and Tulong, Urdaneta or Binalonan area, Pangasinan',
    aliases: ['Tulong Bago Tulay', 'Tulong Iregasyon', 'Citi Hardware', 'Sumabnit High School', 'Sumabnit Barangay Hall']
  },
  'Binalonan / Sili': {
    locationLabel: 'Binalonan and Sili, Pangasinan',
    aliases: ['UEP College', 'DepEd', 'WCC College', 'Crossing Sabatan', 'Aleva Gas Station', 'Sili Elementary School', 'Sili Bridge', 'Binalonan Plaza']
  },
  'Vacante / Bugayong': {
    locationLabel: 'Vacante and Bugayong, Binalonan, Pangasinan',
    aliases: ['Paraiso', 'Vacante Barangay Hall', 'Bugayong Barangay Hall', 'Bugayong Bridge']
  },
  'Rosario / Villa Pozzorubio': {
    locationLabel: 'Rosario and Villa Pozzorubio, Pozzorubio, Pangasinan',
    aliases: ['Malayan', 'Casavaan', 'Barangay Casavaan', 'Sitio Bucot', 'Alibeng Elementary School', 'Buneg Street', 'Alipang Barangay Hall', 'Villa Pozzorubio 711', 'Pozzorubio Pangasinan']
  },
  'Pozzorubio Bayan': {
    locationLabel: 'Poblacion, Pozzorubio, Pangasinan',
    aliases: ['Centrum Fuel Alipang', 'Imbalabalatong', 'Benigno High School', 'McDonalds Pozzorubio', 'Centrum Fuel Cablong', 'Magic Mall', 'Palguyod', 'Bobonan Junction', 'Pozzorubio Public Market']
  },
  'Batakil': {
    locationLabel: 'Batakil, Pozzorubio, Pangasinan',
    aliases: ['Batakil Barangay Hall', 'Batakil Rice Mill', 'Tumayab Street']
  },
  'Sison NCC': {
    locationLabel: 'Labayug, Sison, Pangasinan',
    aliases: ['Animal Quarantine Asan Sur', 'Barangay Hillside', 'NCC', 'Public Market Sison', 'Bila Palaod', 'Bila Padaya', 'Northern Cement']
  },
  'Sison Ice Plant': {
    locationLabel: 'Paldit, Sison, Pangasinan',
    aliases: ['Ice Plant', 'Ram Fuel', 'Lizas Restaurant', 'Iglesia Ni Cristo Paldit', 'Paldit Sison']
  },
  'Cauringan / Artacho / Agat': {
    locationLabel: 'Cauringan, Artacho, and Agat, Sison, Pangasinan',
    aliases: ['Cauringan Bago Tplex', 'Cauringan Barangay Hall', 'NLAC Hospital', 'NLAC High School', 'Barangay Sunshine', 'Artacho Overpass', 'Iglesia Ni Cristo Agat', 'Agat Barangay Hall', 'Agat Bypass']
  },
  'Esperanza / Udiao': {
    locationLabel: 'Esperanza and Udiao, Sison or Rosario, La Union',
    aliases: ['Pepsi Plantation', 'PJI Cosmetics', 'Udiao Highschool', 'Udiao Barangay Hall', 'Udiao 711', 'Esperanza Bridge']
  },
  'Saitan / Jollibee': {
    locationLabel: 'Saitan, Rosario, La Union',
    aliases: ['Metrobank', 'Saitan Junction', 'Saitan Jollibee', 'Clean Fuel', 'Jollibee Rosario']
  },
  'Rosario (La Union)': {
    locationLabel: 'Poblacion, Rosario, La Union',
    aliases: ['Public Market', 'Starbucks', 'Friendship', 'Bus Stop', 'Alipang', 'Inabaan', 'Rosario La Union']
  },
  'Casilagan / Cuenca': {
    locationLabel: 'Casilagan and Cuenca, Rosario or Pugo, La Union',
    aliases: ['Casilagan Barangay Hall', 'Cuenca Elementary School', 'Cuenca Plaza', 'Cuenca Police Station', 'Cuenca Norte']
  },
  'San Luis': {
    locationLabel: 'San Luis, Pugo, La Union',
    aliases: ['San Luis School', 'San Luis Plaza', 'San Luis Subdivision']
  },
  'Maoasoas': {
    locationLabel: 'Maoasoas, Pugo, La Union',
    aliases: ['Maoasoas Sur Barangay Hall', 'Maoasoas High School', 'Maoasoas Annex Elementary School', 'Petrol Fuel', 'PM Fuel', 'Maoasoas Bridge']
  },
  'Ambangonan': {
    locationLabel: 'Ambangonan, Pugo, La Union',
    aliases: ['Sitio Dagdagupan', 'Ambangonan Barangay Hall']
  },
  'Ambelete': {
    locationLabel: 'Ambelete, Pugo, La Union',
    aliases: ['Star Fuel', 'Ambelete Elementary School', 'Ambelete Barangay Hall', 'Kambing House', 'Tres Marias Eatery']
  },
  'Pugo Crossing': {
    locationLabel: 'Poblacion East, Pugo, La Union',
    aliases: ['Junction', 'Duplas Barangay Hall', 'Flying V Gas Station', 'Cares Crossing', 'DG Pelayo Gas Station', 'Tapuacan', 'Tinoyans', 'Pugad', 'Pugo Bagui Road Junction']
  },
  'Palina': {
    locationLabel: 'Palina, Tuba, Benguet',
    aliases: ['El Pueblo De Pugo', 'Palina Barangay Hall', 'Lolo and Lola Furnitures', 'Batangal Street Jeep Station', 'Palina Elementary School', 'Triple RJ Gas Station', 'Palina Taloy Sur Elementary School']
  },
  'Salpang, Taloy': {
    locationLabel: 'Salpang and Taloy Sur, Tuba, Benguet',
    aliases: ['A+G Hardware', 'Salpang Animal Quarantine Station', 'Salpang Junction', 'Taloy Sur Barangay Hall']
  },
  'Realiza / TAFARMCO': {
    locationLabel: 'Poblacion or Taloy Sur, Tuba, Benguet',
    aliases: ['Realiza Compound', 'Taloy Sur Barangay Hall', 'Tafarmco', 'Tafarmco Office']
  },
  'Bayacsan / Bawek / Poyopoy': {
    locationLabel: 'Twin Peaks, Tuba, Benguet',
    aliases: ['Barangay Baw-ek', 'Barangay Bayacsan', 'Barangay Poyopoy', 'Flying V Gas Station', 'Gold Rich Bayacsan', 'Poyopoy Outpost', 'Twin Peaks']
  },
  'Tuba / Rockshed': {
    locationLabel: 'Poblacion or Camp 1, Tuba, Benguet',
    aliases: ['Wilcon Depot Tuba', 'Bago Tunnel Rockshed', 'Tuba Municipal Hall', 'Camp 1', 'Rockshed Tunnel', 'Poblacion Tuba']
  },
  'Baguio': {
    locationLabel: 'Baguio City, Benguet',
    aliases: ['Badiwan', 'Tuba Junction Dumpsite', 'Green Valley Junction', 'Suello Village', 'Saint Peter Chapel', 'Nova Lodge', 'Bakakeng Pure Gold', 'Kitma Junction', 'Crystal Cave Junction', 'Moldex Residence', 'Bakakeng Junction', 'BGH Bus Stop', 'Convention', 'Gov Pack', 'Baguio Terminal', 'Session Road', 'SM City Baguio']
  }
};

const ROUTE_STOP_VOICE_CONTEXT: Record<string, Record<string, RouteStopVoiceContext>> = {
  [ORDINARY_BAYAMBANG_ROUTE_ID]: BAYAMBANG_BAGUIO_VOICE_CONTEXT,
  [AIRCON_BAYAMBANG_ROUTE_ID]: BAYAMBANG_BAGUIO_VOICE_CONTEXT
};

export const getRouteStopVoiceContext = (routeId: string, stopName: string) =>
  ROUTE_STOP_VOICE_CONTEXT[routeId]?.[stopName] ?? null;
