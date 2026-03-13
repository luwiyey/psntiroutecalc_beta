
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { AppContextType, AppSettings, FareRecord, TallySession } from '../types';
import { DEFAULT_ROUTE, DEFAULT_SETTINGS, ROUTES, getReadyRouteById } from '../constants';
import { useAuth } from './AuthContext';

const AppContext = createContext<AppContextType | undefined>(undefined);
const SETTINGS_STORAGE_KEY = 'psnti_settings';
const HISTORY_STORAGE_KEY = 'psnti_history';
const SESSIONS_STORAGE_KEY = 'psnti_sessions';

const getRouteDefaults = (routeId: string) => {
  const route = getReadyRouteById(routeId) ?? DEFAULT_ROUTE;

  return {
    route,
    routeSettings: {
      activeRouteId: route.id,
      regularRate: route.fare.regularRate,
      discountRate: route.fare.discountRate
    }
  };
};

const createDefaultSession = (routeId: string, routeLabel: string): TallySession => ({
  id: `session-${routeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  date: new Date().toISOString(),
  status: 'open',
  routeId,
  routeLabel,
  trips: [{
    id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Trip 1',
    direction: 'north',
    sheets: [{
      id: `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      slots: Array(100).fill(0),
      status: 'in-progress',
      lastUpdatedAt: Date.now()
    }]
  }]
});

const normalizeSessions = (savedSessions: TallySession[] | null): TallySession[] => {
  const baseSessions = (savedSessions ?? []).map(session => ({
    ...session,
    routeId: session.routeId || DEFAULT_ROUTE.id,
    routeLabel: session.routeLabel || DEFAULT_ROUTE.label
  }));
  const readyRoutes = ROUTES.filter(route => route.status === 'ready');

  readyRoutes.forEach(route => {
    const hasRouteSession = baseSessions.some(session => session.routeId === route.id);
    if (!hasRouteSession) {
      baseSessions.push(createDefaultSession(route.id, route.label));
    }
  });

  return baseSessions;
};

const getUserStorageKey = (baseKey: string, employeeId: string) => `${baseKey}_${employeeId}`;
const getStoredUserValue = (baseKey: string, employeeId: string) => {
  const userScopedValue = localStorage.getItem(getUserStorageKey(baseKey, employeeId));
  if (userScopedValue !== null) {
    return userScopedValue;
  }

  return localStorage.getItem(baseKey);
};

const normalizeSettings = (savedSettings: Partial<AppSettings> | null): AppSettings => {
  if (!savedSettings) {
    return DEFAULT_SETTINGS;
  }

  const merged = { ...DEFAULT_SETTINGS, ...savedSettings };
  const { routeSettings } = getRouteDefaults(merged.activeRouteId);
  const needsFareMigration =
    savedSettings.fareVersion !== DEFAULT_SETTINGS.fareVersion ||
    savedSettings.activeRouteId !== routeSettings.activeRouteId ||
    savedSettings.regularRate !== routeSettings.regularRate ||
    savedSettings.discountRate !== routeSettings.discountRate;

  if (!needsFareMigration) {
    return merged;
  }

  return {
    ...merged,
    fareVersion: DEFAULT_SETTINGS.fareVersion,
    ...routeSettings
  };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authState } = useAuth();
  const initialSavedSettings =
    authState.isAuthenticated && authState.employeeId
      ? getStoredUserValue(SETTINGS_STORAGE_KEY, authState.employeeId)
      : null;
  const initialSettings = normalizeSettings(initialSavedSettings ? JSON.parse(initialSavedSettings) : null);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);

  const initialRoute = getReadyRouteById(settings.activeRouteId) ?? DEFAULT_ROUTE;
  const [origin, setOrigin] = useState(initialRoute.stops[0]?.name ?? '');
  const [destination, setDestination] = useState(initialRoute.stops[initialRoute.stops.length - 1]?.name ?? '');
  const initialSavedHistory =
    authState.isAuthenticated && authState.employeeId
      ? getStoredUserValue(HISTORY_STORAGE_KEY, authState.employeeId)
      : null;
  const [history, setHistory] = useState<FareRecord[]>(initialSavedHistory ? JSON.parse(initialSavedHistory) : []);

  const initialSavedSessions =
    authState.isAuthenticated && authState.employeeId
      ? getStoredUserValue(SESSIONS_STORAGE_KEY, authState.employeeId)
      : null;
  const [sessions, setSessions] = useState<TallySession[]>(() => normalizeSessions(initialSavedSessions ? JSON.parse(initialSavedSessions) : null));

  const [tallyNav, setTallyNav] = useState({
    sessionId: '',
    tripIdx: 0,
    sheetIdx: 0,
    blockIdx: 0
  });

  const [activeFare, setActiveFare] = useState(0);
  const activeRoute = useMemo(
    () => getReadyRouteById(settings.activeRouteId) ?? DEFAULT_ROUTE,
    [settings.activeRouteId]
  );

  useEffect(() => {
    if (!authState.isAuthenticated || !authState.employeeId) {
      return;
    }

    const settingsKey = getUserStorageKey(SETTINGS_STORAGE_KEY, authState.employeeId);
    const savedSettings = getStoredUserValue(SETTINGS_STORAGE_KEY, authState.employeeId);
    const savedHistory = getStoredUserValue(HISTORY_STORAGE_KEY, authState.employeeId);
    const savedSessions = getStoredUserValue(SESSIONS_STORAGE_KEY, authState.employeeId);
    const nextSettings = normalizeSettings(savedSettings ? JSON.parse(savedSettings) : null);
    const nextRoute = getReadyRouteById(nextSettings.activeRouteId) ?? DEFAULT_ROUTE;

    setSettings(nextSettings);
    setOrigin(nextRoute.stops[0]?.name ?? '');
    setDestination(nextRoute.stops[nextRoute.stops.length - 1]?.name ?? '');
    setHistory(savedHistory ? JSON.parse(savedHistory) : []);
    setSessions(normalizeSessions(savedSessions ? JSON.parse(savedSessions) : null));
    setTallyNav({
      sessionId: '',
      tripIdx: 0,
      sheetIdx: 0,
      blockIdx: 0
    });
    localStorage.setItem(settingsKey, JSON.stringify(nextSettings));
    localStorage.setItem(getUserStorageKey(HISTORY_STORAGE_KEY, authState.employeeId), JSON.stringify(savedHistory ? JSON.parse(savedHistory) : []));
    localStorage.setItem(getUserStorageKey(SESSIONS_STORAGE_KEY, authState.employeeId), JSON.stringify(normalizeSessions(savedSessions ? JSON.parse(savedSessions) : null)));
  }, [authState.employeeId, authState.isAuthenticated]);

  useEffect(() => {
    const stopNames = new Set(activeRoute.stops.map(stop => stop.name));
    const defaultOrigin = activeRoute.stops[0]?.name ?? '';
    const defaultDestination = activeRoute.stops[activeRoute.stops.length - 1]?.name ?? '';

    setOrigin(prev => (stopNames.has(prev) ? prev : defaultOrigin));
    setDestination(prev => (stopNames.has(prev) ? prev : defaultDestination));
  }, [activeRoute]);

  useEffect(() => {
    if (authState.isAuthenticated && authState.employeeId) {
      localStorage.setItem(getUserStorageKey(SETTINGS_STORAGE_KEY, authState.employeeId), JSON.stringify(settings));
    }
    document.documentElement.classList.toggle('dark', settings.isNightMode);
  }, [authState.employeeId, authState.isAuthenticated, settings]);

  useEffect(() => {
    if (!authState.isAuthenticated || !authState.employeeId) {
      return;
    }

    localStorage.setItem(getUserStorageKey(HISTORY_STORAGE_KEY, authState.employeeId), JSON.stringify(history));
  }, [authState.employeeId, authState.isAuthenticated, history]);

  useEffect(() => {
    if (!authState.isAuthenticated || !authState.employeeId) {
      return;
    }

    localStorage.setItem(getUserStorageKey(SESSIONS_STORAGE_KEY, authState.employeeId), JSON.stringify(sessions));
  }, [authState.employeeId, authState.isAuthenticated, sessions]);

  const addRecord = (record: Omit<FareRecord, 'id' | 'timestamp'>) => {
    const newRecord: FareRecord = {
      ...record,
      routeId: record.routeId ?? activeRoute.id,
      routeLabel: record.routeLabel ?? activeRoute.label,
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

  const selectRoute = (routeId: string) => {
    const nextRoute = getReadyRouteById(routeId);

    if (!nextRoute) {
      return;
    }

    const { route, routeSettings } = getRouteDefaults(nextRoute.id);

    setSettings(prev => ({
      ...prev,
      fareVersion: DEFAULT_SETTINGS.fareVersion,
      hasAssignedRoute: true,
      ...routeSettings
    }));
    setOrigin(route.stops[0]?.name ?? '');
    setDestination(route.stops[route.stops.length - 1]?.name ?? '');
  };

  return (
    <AppContext.Provider value={{
      routes: ROUTES,
      activeRoute,
      selectRoute,
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
