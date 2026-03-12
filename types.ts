
import React from 'react';

export interface Stop {
  name: string;
  km: number;
  isTerminal?: boolean;
}

export interface FareRecord {
  id: string;
  timestamp: number;
  origin: string;
  destination: string;
  distance: number;
  regularFare: number;
  discountedFare: number;
  isFavorite: boolean;
  type?: 'calc' | 'tally';
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
  trips: TallyTrip[];
}

export interface AppSettings {
  fareVersion: number;
  regularRate: number;
  discountRate: number;
  isNightMode: boolean;
  conductorMode: boolean;
}

export interface AppContextType {
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
  showToast: (msg: string, type?: 'info' | 'success') => void;
}
