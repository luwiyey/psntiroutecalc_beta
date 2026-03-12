
import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppContextType, AppSettings, FareRecord, TallySession } from '../types';
import { STOPS, DEFAULT_SETTINGS } from '../constants';

const AppContext = createContext<AppContextType | undefined>(undefined);

const normalizeSettings = (savedSettings: Partial<AppSettings> | null): AppSettings => {
  if (!savedSettings) {
    return DEFAULT_SETTINGS;
  }

  const merged = { ...DEFAULT_SETTINGS, ...savedSettings };
  const needsFareMigration = savedSettings.fareVersion !== DEFAULT_SETTINGS.fareVersion;

  if (!needsFareMigration) {
    return merged;
  }

  return {
    ...merged,
    fareVersion: DEFAULT_SETTINGS.fareVersion,
    regularRate: DEFAULT_SETTINGS.regularRate,
    discountRate: DEFAULT_SETTINGS.discountRate
  };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('psnti_settings');
    return normalizeSettings(saved ? JSON.parse(saved) : null);
  });

  const [origin, setOrigin] = useState(STOPS[0].name);
  const [destination, setDestination] = useState(STOPS[STOPS.length - 1].name);
  const [history, setHistory] = useState<FareRecord[]>(() => {
    const saved = localStorage.getItem('psnti_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [sessions, setSessions] = useState<TallySession[]>(() => {
    const saved = localStorage.getItem('psnti_sessions');
    if (saved) return JSON.parse(saved);
    
    // Default initial session
    return [{
      id: 'session-1',
      date: new Date().toISOString(),
      status: 'open',
      trips: [{
        id: 'trip-1',
        name: 'Trip 1',
        direction: 'north',
        sheets: [{
          id: 'sheet-1',
          slots: Array(100).fill(0),
          status: 'in-progress',
          lastUpdatedAt: Date.now()
        }]
      }]
    }];
  });

  const [tallyNav, setTallyNav] = useState({
    sessionId: 'session-1',
    tripIdx: 0,
    sheetIdx: 0,
    blockIdx: 0
  });

  const [activeFare, setActiveFare] = useState(0);

  useEffect(() => {
    localStorage.setItem('psnti_settings', JSON.stringify(settings));
    document.documentElement.classList.toggle('dark', settings.isNightMode);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('psnti_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('psnti_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const addRecord = (record: Omit<FareRecord, 'id' | 'timestamp'>) => {
    const newRecord: FareRecord = {
      ...record,
      id: `rec-${Date.now()}`,
      timestamp: Date.now()
    };
    setHistory(prev => [newRecord, ...prev]);
  };

  const toggleFavorite = (id: string) => {
    setHistory(prev => prev.map(h => h.id === id ? { ...h, isFavorite: !h.isFavorite } : h));
  };

  const deleteHistory = () => {
    if (window.confirm("Clear all logs? This cannot be undone.")) {
      setHistory([]);
    }
  };

  const showToast = (msg: string) => {
    // Simple mock toast - in real app we might use a context state
    console.log("Toast:", msg);
  };

  return (
    <AppContext.Provider value={{
      settings, setSettings,
      origin, setOrigin,
      destination, setDestination,
      history, addRecord, toggleFavorite, deleteHistory,
      activeFare, setActiveFare,
      sessions, setSessions,
      tallyNav, setTallyNav,
      showToast
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};
