
import React from 'react';

export interface Stop {
  name: string;
  km: number;
  isTerminal?: boolean;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  coverageRange?: string;
  distanceToBaguio?: number;
  aliases?: string[];
  calibrationSamples?: number;
  lastCalibratedAt?: number;
}

export interface RouteFareBaseline {
  regularRate: number;
  discountRate: number;
  minimumRegularFare: number | null;
  minimumDiscountFare: number | null;
  minimumDistanceKm?: number | null;
}

export interface RouteFareRules {
  regularRate: number;
  discountRate: number;
  minimumRegularFare: number | null;
  minimumDiscountFare: number | null;
  minimumDistanceKm?: number | null;
  roundingMode?: 'legacy' | 'standard';
  previousFare?: RouteFareBaseline;
}

export interface RouteProfile {
  id: string;
  label: string;
  shortLabel: string;
  status: 'ready' | 'locked';
  lockedReason?: string;
  stops: Stop[];
  fare: RouteFareRules;
}

export interface StopSubmission {
  id: string;
  routeId: string;
  routeLabel: string;
  stopName: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  radiusMeters: number;
  sampleCount: number;
  source: 'native' | 'browser';
  syncStatus: 'pending' | 'synced';
  createdAt: number;
  employeeId: string | null;
  employeeName: string | null;
  deviceId: string | null;
  notes?: string;
}

export interface VerifiedStop {
  id: string;
  routeId: string;
  routeLabel: string;
  stopName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  sampleCount: number;
  submissionCount: number;
  confidenceScore: number;
  source: 'computed' | 'manual';
  updatedAt: number;
}

export interface StopSyncState {
  enabled: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
  pendingCount: number;
  remoteCount: number;
  verifiedCount: number;
}

export interface ReminderSettings {
  enabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export interface StopReminder {
  id: string;
  routeId: string;
  routeLabel: string;
  stopName: string;
  passengerCount: number;
  enabled: boolean;
  status: 'active' | 'arriving' | 'done';
  createdAt: number;
  alertsTriggered: {
    twoMinute: boolean;
    oneMinute: boolean;
    arrival: boolean;
  };
}

export interface FareRecord {
  id: string;
  timestamp: number;
  origin: string;
  destination: string;
  distance: number;
  regularFare: number;
  discountedFare: number;
  punchedFareType?: 'regular' | 'discounted';
  isFavorite: boolean;
  type?: 'calc' | 'tally';
  routeId?: string;
  routeLabel?: string;
  shiftId?: string | null;
}

export interface TallySheet {
  id: string;
  slots: number[];
  status: 'in-progress' | 'recorded';
  lastUpdatedAt: number;
}

export interface TallyTrip {
  id: string;
  name: string;
  direction: 'north' | 'south';
  sheets: TallySheet[];
}

export interface TallySession {
  id: string;
  date: string;
  status: 'open' | 'closed';
  routeId: string;
  routeLabel: string;
  shiftId?: string | null;
  trips: TallyTrip[];
}

export interface ShiftRecord {
  id: string;
  routeId: string;
  routeLabel: string;
  employeeId: string | null;
  employeeName: string | null;
  startedAt: number;
  endedAt: number | null;
  status: 'open' | 'closed';
}

export interface AppSettings {
  fareVersion: number;
  activeRouteId: string;
  hasAssignedRoute: boolean;
  regularRate: number;
  discountRate: number;
  isNightMode: boolean;
  conductorMode: boolean;
}

export interface AppContextType {
  routes: RouteProfile[];
  activeRoute: RouteProfile;
  selectRoute: (routeId: string) => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  origin: string;
  setOrigin: (val: string) => void;
  destination: string;
  setDestination: (val: string) => void;
  history: FareRecord[];
  addRecord: (record: Omit<FareRecord, 'id' | 'timestamp'>) => void;
  toggleFavorite: (id: string) => void;
  deleteHistory: () => void;
  activeFare: number;
  setActiveFare: (val: number) => void;
  sessions: TallySession[];
  setSessions: React.Dispatch<React.SetStateAction<TallySession[]>>;
  tallyNav: { sessionId: string; tripIdx: number; sheetIdx: number; blockIdx: number };
  setTallyNav: React.Dispatch<React.SetStateAction<{ sessionId: string; tripIdx: number; sheetIdx: number; blockIdx: number }>>;
  stopSubmissions: StopSubmission[];
  verifiedStops: VerifiedStop[];
  addStopSubmission: (submission: {
    stopName: string;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    radiusMeters: number;
    sampleCount: number;
    source: 'native' | 'browser';
    notes?: string;
  }) => void;
  syncStopSubmissions: () => Promise<boolean>;
  stopSyncState: StopSyncState;
  currentShift: ShiftRecord | null;
  shiftHistory: ShiftRecord[];
  startShift: () => ShiftRecord | null;
  endShift: () => ShiftRecord | null;
  stopReminders: StopReminder[];
  setStopReminders: React.Dispatch<React.SetStateAction<StopReminder[]>>;
  reminderSettings: ReminderSettings;
  setReminderSettings: React.Dispatch<React.SetStateAction<ReminderSettings>>;
  showToast: (msg: string, type?: 'info' | 'success') => void;
}
