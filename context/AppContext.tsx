import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppContextType,
  AppSettings,
  FareRecord,
  ReminderSettings,
  RouteFareRules,
  RouteLandmark,
  RouteOverridesMap,
  RouteSegment,
  ShiftRecord,
  StopReminder,
  StopOverride,
  StopSubmission,
  StopSyncState,
  TallySession,
  VerifiedStop
} from '../types';
import { DEFAULT_ROUTE, DEFAULT_SETTINGS, ROUTES, getReadyRouteById } from '../constants';
import { useAuth } from './AuthContext';
import { trackAnalyticsEvent } from '../utils/analytics';
import {
  buildVerifiedStopsFromSubmissions,
  createStopSubmissionId,
  dedupeStopSubmissions,
  mergeStopsWithVerifiedStops
} from '../utils/stop-data';
import {
  buildSeedRouteLandmarks,
  buildSeedRouteSegments,
  mergeRouteLandmarks,
  mergeRouteSegments,
  mergeStopsWithRouteLandmarks
} from '../utils/route-geometry';
import {
  fetchRouteLandmarks,
  fetchRouteSegments,
  hasRouteGeometrySyncConfig
} from '../utils/route-geometry-sync';
import {
  fetchRouteStopSubmissions,
  fetchRouteVerifiedStops,
  hasStopSyncConfig,
  uploadStopSubmissions,
  upsertVerifiedStops
} from '../utils/stop-sync';

const AppContext = createContext<AppContextType | undefined>(undefined);
const SETTINGS_STORAGE_KEY = 'psnti_settings';
const HISTORY_STORAGE_KEY = 'psnti_history';
const SESSIONS_STORAGE_KEY = 'psnti_sessions';
const SHIFT_HISTORY_STORAGE_KEY = 'psnti_shifts_v1';
const STOP_SUBMISSIONS_STORAGE_KEY = 'psnti_stop_submissions_v1';
const STOP_REMINDERS_STORAGE_KEY = 'psnti_stop_reminders_v1';
const REMINDER_SETTINGS_STORAGE_KEY = 'psnti_reminder_settings_v1';
const ROUTE_OVERRIDES_STORAGE_KEY = 'psnti_route_overrides_v1';

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  soundEnabled: true,
  vibrationEnabled: true
};
const ACTIVE_APP_IDLE_WINDOW_MS = 5 * 60 * 1000;
const MOTIVATION_INTERVAL_MS = 60 * 60 * 1000;

const createShiftId = () => `shift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

const createDefaultSession = (
  routeId: string,
  routeLabel: string,
  shiftId: string | null = null
): TallySession => ({
  id: `session-${routeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  date: new Date().toISOString(),
  status: 'open',
  routeId,
  routeLabel,
  shiftId,
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

const createShiftRecord = (
  routeId: string,
  routeLabel: string,
  employeeId: string | null,
  employeeName: string | null,
  startedMode: 'manual' | 'auto'
): ShiftRecord => ({
  id: createShiftId(),
  routeId,
  routeLabel,
  employeeId,
  employeeName,
  startedAt: Date.now(),
  endedAt: null,
  status: 'open',
  startedMode,
  activeUsageMs: 0,
  lastActivityAt: Date.now(),
  encouragementCount: 0
});

const normalizeSessions = (savedSessions: TallySession[] | null): TallySession[] => {
  return (savedSessions ?? [])
    .filter(session => session?.id && session?.routeId)
    .map(session => ({
      ...session,
      routeId: session.routeId || DEFAULT_ROUTE.id,
      routeLabel: session.routeLabel || DEFAULT_ROUTE.label,
      shiftId: session.shiftId ?? null
    }));
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

const normalizeHistory = (savedHistory: FareRecord[] | null): FareRecord[] => {
  return (savedHistory ?? [])
    .filter(record => record?.id && record?.origin && record?.destination)
    .map(record => ({
      ...record,
      routeId: record.routeId ?? DEFAULT_ROUTE.id,
      routeLabel: record.routeLabel ?? DEFAULT_ROUTE.label,
      shiftId: record.shiftId ?? null
    }));
};

const normalizeStopSubmissions = (savedSubmissions: StopSubmission[] | null): StopSubmission[] => {
  if (!savedSubmissions) {
    return [];
  }

  return savedSubmissions
    .filter(submission => submission && submission.routeId && submission.stopName)
    .map(submission => ({
      ...submission,
      syncStatus: submission.syncStatus === 'synced' ? 'synced' : 'pending',
      sampleCount: Math.max(1, submission.sampleCount ?? 1),
      radiusMeters: Math.max(35, submission.radiusMeters ?? 60),
      createdAt: submission.createdAt ?? Date.now(),
      employeeId: submission.employeeId ?? null,
      employeeName: submission.employeeName ?? null,
      deviceId: submission.deviceId ?? null
    }));
};

const normalizeStopReminders = (savedReminders: StopReminder[] | null): StopReminder[] => {
  if (!savedReminders) {
    return [];
  }

  return savedReminders
    .filter(reminder => reminder && reminder.routeId && reminder.stopName)
    .map(reminder => ({
      ...reminder,
      enabled: reminder.enabled ?? true,
      status: reminder.status ?? 'active',
      passengerCount: Math.max(1, reminder.passengerCount ?? 1),
      matchConfidence: reminder.matchConfidence ?? 'exact-stop',
      matchedPlaceLabel: reminder.matchedPlaceLabel ?? null,
      lastEtaSeconds:
        typeof reminder.lastEtaSeconds === 'number' && Number.isFinite(reminder.lastEtaSeconds)
          ? reminder.lastEtaSeconds
          : undefined,
      alertsTriggered: {
        twoMinute: Boolean(reminder.alertsTriggered?.twoMinute),
        oneMinute: Boolean(reminder.alertsTriggered?.oneMinute),
        arrival: Boolean(reminder.alertsTriggered?.arrival)
      }
    }));
};

const normalizeReminderSettings = (savedSettings: Partial<ReminderSettings> | null): ReminderSettings => ({
  ...DEFAULT_REMINDER_SETTINGS,
  ...(savedSettings ?? {})
});

const normalizeShiftHistory = (savedShifts: ShiftRecord[] | null): ShiftRecord[] => {
  return (savedShifts ?? [])
    .filter(shift => shift?.id && shift?.routeId && shift?.startedAt)
    .map<ShiftRecord>(shift => ({
      ...shift,
      employeeId: shift.employeeId ?? null,
      employeeName: shift.employeeName ?? null,
      endedAt: shift.endedAt ?? null,
      status: shift.status === 'closed' ? 'closed' : 'open',
      startedMode: shift.startedMode === 'manual' ? 'manual' : 'auto',
      activeUsageMs: Math.max(0, shift.activeUsageMs ?? 0),
      lastActivityAt: shift.lastActivityAt ?? shift.endedAt ?? shift.startedAt,
      encouragementCount: Math.max(0, shift.encouragementCount ?? 0)
    }))
    .sort((left, right) => right.startedAt - left.startedAt);
};

const normalizeRouteOverrides = (savedOverrides: RouteOverridesMap | null): RouteOverridesMap => {
  if (!savedOverrides || typeof savedOverrides !== 'object') {
    return {};
  }

  return Object.entries(savedOverrides).reduce<RouteOverridesMap>((accumulator, [routeId, override]) => {
    if (!override || typeof override !== 'object') {
      return accumulator;
    }

    accumulator[routeId] = {
      fare: override.fare ? { ...override.fare } : undefined,
      stops: override.stops ? { ...override.stops } : undefined
    };

    return accumulator;
  }, {});
};

const applyStopOverride = (stop: typeof DEFAULT_ROUTE.stops[number], override?: StopOverride) => {
  if (!override) {
    return stop;
  }

  return {
    ...stop,
    ...(override.name ? { name: override.name } : {}),
    ...(typeof override.km === 'number' && Number.isFinite(override.km) ? { km: override.km } : {}),
    ...(override.coverageRange ? { coverageRange: override.coverageRange } : {}),
    ...(typeof override.latitude === 'number' && Number.isFinite(override.latitude) ? { latitude: override.latitude } : {}),
    ...(typeof override.longitude === 'number' && Number.isFinite(override.longitude) ? { longitude: override.longitude } : {}),
    ...(typeof override.radiusMeters === 'number' && Number.isFinite(override.radiusMeters) ? { radiusMeters: override.radiusMeters } : {}),
    ...(override.googlePlaceId ? { googlePlaceId: override.googlePlaceId } : {}),
    ...(override.googleMapsQuery ? { googleMapsQuery: override.googleMapsQuery } : {}),
    ...(override.aliases ? { aliases: override.aliases } : {})
  };
};

const applyRouteOverride = (
  route: typeof DEFAULT_ROUTE,
  override?: RouteOverridesMap[string]
) => {
  if (!override) {
    return route;
  }

  const stopOverrides = new Map<string, StopOverride>(
    Object.entries(override.stops ?? {}).map(([stopName, stopOverride]) => [stopName.toLowerCase(), stopOverride])
  );

  return {
    ...route,
    fare: override.fare
      ? {
          ...route.fare,
          ...override.fare
        }
      : route.fare,
    stops: route.stops.map(stop => applyStopOverride(stop, stopOverrides.get(stop.name.toLowerCase())))
  };
};

const buildDefaultStopSyncState = (pendingCount: number, verifiedCount = 0): StopSyncState => ({
  enabled: hasStopSyncConfig(),
  isSyncing: false,
  lastSyncedAt: null,
  lastError: null,
  pendingCount,
  remoteCount: 0,
  verifiedCount
});

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authState } = useAuth();
  const initialSavedSettings =
    authState.isAuthenticated && authState.employeeId
      ? getStoredUserValue(SETTINGS_STORAGE_KEY, authState.employeeId)
      : null;
  const initialSettings = normalizeSettings(initialSavedSettings ? JSON.parse(initialSavedSettings) : null);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const initialSavedRouteOverrides =
    authState.isAuthenticated && authState.employeeId
      ? getStoredUserValue(ROUTE_OVERRIDES_STORAGE_KEY, authState.employeeId)
      : null;
  const [routeOverrides, setRouteOverrides] = useState<RouteOverridesMap>(
    initialSavedRouteOverrides ? normalizeRouteOverrides(JSON.parse(initialSavedRouteOverrides)) : {}
  );

  const initialSavedStopSubmissions = localStorage.getItem(STOP_SUBMISSIONS_STORAGE_KEY);
  const initialNormalizedStopSubmissions = initialSavedStopSubmissions
    ? normalizeStopSubmissions(JSON.parse(initialSavedStopSubmissions))
    : [];
  const [stopSubmissions, setStopSubmissions] = useState<StopSubmission[]>(initialNormalizedStopSubmissions);
  const [remoteStopSubmissions, setRemoteStopSubmissions] = useState<StopSubmission[]>([]);
  const [remoteVerifiedStops, setRemoteVerifiedStops] = useState<VerifiedStop[]>([]);
  const [remoteRouteLandmarks, setRemoteRouteLandmarks] = useState<RouteLandmark[]>([]);
  const [remoteRouteSegments, setRemoteRouteSegments] = useState<RouteSegment[]>([]);
  const [stopSyncState, setStopSyncState] = useState<StopSyncState>(() =>
    buildDefaultStopSyncState(
      initialNormalizedStopSubmissions.filter(submission => submission.syncStatus !== 'synced').length
    )
  );

  const initialRoute = getReadyRouteById(settings.activeRouteId) ?? DEFAULT_ROUTE;
  const [origin, setOrigin] = useState(initialRoute.stops[0]?.name ?? '');
  const [destination, setDestination] = useState(initialRoute.stops[initialRoute.stops.length - 1]?.name ?? '');
  const initialSavedHistory =
    authState.isAuthenticated && authState.employeeId
      ? getStoredUserValue(HISTORY_STORAGE_KEY, authState.employeeId)
      : null;
  const [history, setHistory] = useState<FareRecord[]>(
    initialSavedHistory ? normalizeHistory(JSON.parse(initialSavedHistory)) : []
  );

  const initialSavedSessions =
    authState.isAuthenticated && authState.employeeId
      ? getStoredUserValue(SESSIONS_STORAGE_KEY, authState.employeeId)
      : null;
  const [sessions, setSessions] = useState<TallySession[]>(() =>
    normalizeSessions(initialSavedSessions ? JSON.parse(initialSavedSessions) : null)
  );

  const initialSavedShiftHistory =
    authState.isAuthenticated && authState.employeeId
      ? getStoredUserValue(SHIFT_HISTORY_STORAGE_KEY, authState.employeeId)
      : null;
  const [shiftHistory, setShiftHistory] = useState<ShiftRecord[]>(
    initialSavedShiftHistory ? normalizeShiftHistory(JSON.parse(initialSavedShiftHistory)) : []
  );

  const initialSavedReminders =
    authState.isAuthenticated && authState.employeeId
      ? getStoredUserValue(STOP_REMINDERS_STORAGE_KEY, authState.employeeId)
      : null;
  const [stopReminders, setStopReminders] = useState<StopReminder[]>(
    initialSavedReminders ? normalizeStopReminders(JSON.parse(initialSavedReminders)) : []
  );

  const initialReminderSettings =
    authState.isAuthenticated && authState.employeeId
      ? getStoredUserValue(REMINDER_SETTINGS_STORAGE_KEY, authState.employeeId)
      : null;
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(
    normalizeReminderSettings(initialReminderSettings ? JSON.parse(initialReminderSettings) : null)
  );

  const [tallyNav, setTallyNav] = useState({
    sessionId: '',
    tripIdx: 0,
    sheetIdx: 0,
    blockIdx: 0
  });
  const [activeFare, setActiveFare] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' } | null>(null);
  const currentShiftRef = useRef<ShiftRecord | null>(null);

  const showToast = useCallback((msg: string, type: 'info' | 'success' = 'success') => {
    setToast({ message: msg, type });
  }, []);

  const currentShift = useMemo(() => {
    return shiftHistory.find(shift => shift.status === 'open') ?? null;
  }, [shiftHistory]);

  useEffect(() => {
    currentShiftRef.current = currentShift;
  }, [currentShift]);

  const baseActiveRoute = useMemo(
    () => getReadyRouteById(settings.activeRouteId) ?? DEFAULT_ROUTE,
    [settings.activeRouteId]
  );

  const seededRouteLandmarks = useMemo(
    () => buildSeedRouteLandmarks(baseActiveRoute.id, baseActiveRoute.label, baseActiveRoute.stops),
    [baseActiveRoute.id, baseActiveRoute.label, baseActiveRoute.stops]
  );

  const routeLandmarks = useMemo(
    () => mergeRouteLandmarks(seededRouteLandmarks, remoteRouteLandmarks),
    [remoteRouteLandmarks, seededRouteLandmarks]
  );

  const seededRouteSegments = useMemo(
    () => buildSeedRouteSegments(baseActiveRoute.id, baseActiveRoute.label, baseActiveRoute.stops),
    [baseActiveRoute.id, baseActiveRoute.label, baseActiveRoute.stops]
  );

  const routeSegments = useMemo(
    () => mergeRouteSegments(seededRouteSegments, remoteRouteSegments),
    [remoteRouteSegments, seededRouteSegments]
  );

  const localRouteSubmissions = useMemo(
    () => stopSubmissions.filter(submission => submission.routeId === baseActiveRoute.id),
    [baseActiveRoute.id, stopSubmissions]
  );

  const computedVerifiedStops = useMemo(() => {
    const mergedSubmissions = dedupeStopSubmissions([
      ...localRouteSubmissions,
      ...remoteStopSubmissions
    ]);

    return buildVerifiedStopsFromSubmissions(
      baseActiveRoute.id,
      baseActiveRoute.label,
      baseActiveRoute.stops,
      mergedSubmissions
    );
  }, [baseActiveRoute.id, baseActiveRoute.label, baseActiveRoute.stops, localRouteSubmissions, remoteStopSubmissions]);

  const verifiedStops = useMemo(() => {
    const byStopName = new Map<string, VerifiedStop>();

    remoteVerifiedStops.forEach(stop => {
      if (stop.routeId === baseActiveRoute.id) {
        byStopName.set(stop.stopName.toLowerCase(), stop);
      }
    });

    computedVerifiedStops.forEach(stop => {
      byStopName.set(stop.stopName.toLowerCase(), stop);
    });

    const order = new Map<string, number>(
      baseActiveRoute.stops.map((stop, index) => [stop.name.toLowerCase(), index])
    );

    return [...byStopName.values()].sort((left, right) => {
      return (order.get(left.stopName.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.stopName.toLowerCase()) ?? Number.MAX_SAFE_INTEGER);
    });
  }, [baseActiveRoute.id, baseActiveRoute.stops, computedVerifiedStops, remoteVerifiedStops]);

  const activeRoute = useMemo(() => {
    const landmarkMergedStops = mergeStopsWithRouteLandmarks(baseActiveRoute.id, baseActiveRoute.stops, routeLandmarks);
    const verifiedRoute = {
      ...baseActiveRoute,
      stops: mergeStopsWithVerifiedStops(baseActiveRoute.id, landmarkMergedStops, verifiedStops)
    };

    return applyRouteOverride(verifiedRoute, routeOverrides[baseActiveRoute.id]);
  }, [baseActiveRoute, routeLandmarks, routeOverrides, verifiedStops]);

  const loadRemoteRouteSubmissions = useCallback(async (routeId: string) => {
    if (!hasStopSyncConfig() || !navigator.onLine || !routeId) {
      setRemoteStopSubmissions([]);
      setStopSyncState(prev => ({
        ...prev,
        enabled: hasStopSyncConfig(),
        remoteCount: 0
      }));
      return [];
    }

    try {
      const fetchedSubmissions = await fetchRouteStopSubmissions(routeId);
      setRemoteStopSubmissions(fetchedSubmissions);
      setStopSyncState(prev => ({
        ...prev,
        enabled: true,
        remoteCount: fetchedSubmissions.length,
        lastError: null
      }));
      return fetchedSubmissions;
    } catch (error) {
      setRemoteStopSubmissions([]);
      setStopSyncState(prev => ({
        ...prev,
        enabled: true,
        remoteCount: 0,
        lastError: error instanceof Error ? error.message : 'Unable to fetch shared stop submissions.'
      }));
      return [];
    }
  }, []);

  const loadRemoteRouteVerifiedStops = useCallback(async (routeId: string) => {
    if (!hasStopSyncConfig() || !navigator.onLine || !routeId) {
      setRemoteVerifiedStops([]);
      setStopSyncState(prev => ({
        ...prev,
        enabled: hasStopSyncConfig(),
        verifiedCount: 0
      }));
      return [];
    }

    try {
      const fetchedVerifiedStops = await fetchRouteVerifiedStops(routeId);
      setRemoteVerifiedStops(fetchedVerifiedStops);
      setStopSyncState(prev => ({
        ...prev,
        enabled: true,
        verifiedCount: fetchedVerifiedStops.length,
        lastError: null
      }));
      return fetchedVerifiedStops;
    } catch (error) {
      setRemoteVerifiedStops([]);
      setStopSyncState(prev => ({
        ...prev,
        enabled: true,
        verifiedCount: 0,
        lastError: error instanceof Error ? error.message : 'Unable to fetch verified stops right now.'
      }));
      return [];
    }
  }, []);

  const loadRemoteGeometryLandmarks = useCallback(async (routeId: string) => {
    if (!hasRouteGeometrySyncConfig() || !navigator.onLine || !routeId) {
      setRemoteRouteLandmarks([]);
      return [];
    }

    try {
      const fetchedLandmarks = await fetchRouteLandmarks(routeId);
      setRemoteRouteLandmarks(fetchedLandmarks);
      return fetchedLandmarks;
    } catch {
      setRemoteRouteLandmarks([]);
      return [];
    }
  }, []);

  const loadRemoteGeometrySegments = useCallback(async (routeId: string) => {
    if (!hasRouteGeometrySyncConfig() || !navigator.onLine || !routeId) {
      setRemoteRouteSegments([]);
      return [];
    }

    try {
      const fetchedSegments = await fetchRouteSegments(routeId);
      setRemoteRouteSegments(fetchedSegments);
      return fetchedSegments;
    } catch {
      setRemoteRouteSegments([]);
      return [];
    }
  }, []);

  useEffect(() => {
    if (!authState.isAuthenticated || !authState.employeeId) {
      return;
    }

    const settingsKey = getUserStorageKey(SETTINGS_STORAGE_KEY, authState.employeeId);
    const savedSettings = getStoredUserValue(SETTINGS_STORAGE_KEY, authState.employeeId);
    const savedHistory = getStoredUserValue(HISTORY_STORAGE_KEY, authState.employeeId);
    const savedSessions = getStoredUserValue(SESSIONS_STORAGE_KEY, authState.employeeId);
    const savedShiftHistory = getStoredUserValue(SHIFT_HISTORY_STORAGE_KEY, authState.employeeId);
    const savedReminders = getStoredUserValue(STOP_REMINDERS_STORAGE_KEY, authState.employeeId);
    const savedReminderSettings = getStoredUserValue(REMINDER_SETTINGS_STORAGE_KEY, authState.employeeId);
    const savedRouteOverrides = getStoredUserValue(ROUTE_OVERRIDES_STORAGE_KEY, authState.employeeId);
    const nextSettings = normalizeSettings(savedSettings ? JSON.parse(savedSettings) : null);
    const nextHistory = normalizeHistory(savedHistory ? JSON.parse(savedHistory) : null);
    const nextSessions = normalizeSessions(savedSessions ? JSON.parse(savedSessions) : null);
    const nextShiftHistory = normalizeShiftHistory(savedShiftHistory ? JSON.parse(savedShiftHistory) : null);
    const nextReminders = savedReminders ? normalizeStopReminders(JSON.parse(savedReminders)) : [];
    const nextReminderSettings = normalizeReminderSettings(
      savedReminderSettings ? JSON.parse(savedReminderSettings) : null
    );
    const nextRouteOverrides = normalizeRouteOverrides(
      savedRouteOverrides ? JSON.parse(savedRouteOverrides) : null
    );
    const nextRoute = getReadyRouteById(nextSettings.activeRouteId) ?? DEFAULT_ROUTE;

    setSettings(nextSettings);
    setRouteOverrides(nextRouteOverrides);
    setOrigin(nextRoute.stops[0]?.name ?? '');
    setDestination(nextRoute.stops[nextRoute.stops.length - 1]?.name ?? '');
    setHistory(nextHistory);
    setSessions(nextSessions);
    setShiftHistory(nextShiftHistory);
    setStopReminders(nextReminders);
    setReminderSettings(nextReminderSettings);
    setTallyNav({
      sessionId: '',
      tripIdx: 0,
      sheetIdx: 0,
      blockIdx: 0
    });
    localStorage.setItem(settingsKey, JSON.stringify(nextSettings));
    localStorage.setItem(getUserStorageKey(HISTORY_STORAGE_KEY, authState.employeeId), JSON.stringify(nextHistory));
    localStorage.setItem(getUserStorageKey(SESSIONS_STORAGE_KEY, authState.employeeId), JSON.stringify(nextSessions));
    localStorage.setItem(
      getUserStorageKey(SHIFT_HISTORY_STORAGE_KEY, authState.employeeId),
      JSON.stringify(nextShiftHistory)
    );
    localStorage.setItem(
      getUserStorageKey(STOP_REMINDERS_STORAGE_KEY, authState.employeeId),
      JSON.stringify(nextReminders)
    );
    localStorage.setItem(
      getUserStorageKey(REMINDER_SETTINGS_STORAGE_KEY, authState.employeeId),
      JSON.stringify(nextReminderSettings)
    );
    localStorage.setItem(
      getUserStorageKey(ROUTE_OVERRIDES_STORAGE_KEY, authState.employeeId),
      JSON.stringify(nextRouteOverrides)
    );
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

  useEffect(() => {
    if (!authState.isAuthenticated || !authState.employeeId) {
      return;
    }

    localStorage.setItem(
      getUserStorageKey(SHIFT_HISTORY_STORAGE_KEY, authState.employeeId),
      JSON.stringify(shiftHistory)
    );
  }, [authState.employeeId, authState.isAuthenticated, shiftHistory]);

  useEffect(() => {
    localStorage.setItem(STOP_SUBMISSIONS_STORAGE_KEY, JSON.stringify(stopSubmissions));
    setStopSyncState(prev => ({
      ...prev,
      enabled: hasStopSyncConfig(),
      pendingCount: stopSubmissions.filter(submission => submission.syncStatus !== 'synced').length
    }));
  }, [stopSubmissions]);

  useEffect(() => {
    if (!authState.isAuthenticated || !authState.employeeId) {
      return;
    }

    localStorage.setItem(
      getUserStorageKey(STOP_REMINDERS_STORAGE_KEY, authState.employeeId),
      JSON.stringify(stopReminders)
    );
  }, [authState.employeeId, authState.isAuthenticated, stopReminders]);

  useEffect(() => {
    if (!authState.isAuthenticated || !authState.employeeId) {
      return;
    }

    localStorage.setItem(
      getUserStorageKey(REMINDER_SETTINGS_STORAGE_KEY, authState.employeeId),
      JSON.stringify(reminderSettings)
    );
  }, [authState.employeeId, authState.isAuthenticated, reminderSettings]);

  useEffect(() => {
    if (!authState.isAuthenticated || !authState.employeeId) {
      return;
    }

    localStorage.setItem(
      getUserStorageKey(ROUTE_OVERRIDES_STORAGE_KEY, authState.employeeId),
      JSON.stringify(routeOverrides)
    );
  }, [authState.employeeId, authState.isAuthenticated, routeOverrides]);

  useEffect(() => {
    if (!hasStopSyncConfig() && !hasRouteGeometrySyncConfig()) {
      return;
    }

    void Promise.all([
      loadRemoteRouteSubmissions(baseActiveRoute.id),
      loadRemoteRouteVerifiedStops(baseActiveRoute.id),
      loadRemoteGeometryLandmarks(baseActiveRoute.id),
      loadRemoteGeometrySegments(baseActiveRoute.id)
    ]);
  }, [
    baseActiveRoute.id,
    loadRemoteGeometryLandmarks,
    loadRemoteGeometrySegments,
    loadRemoteRouteSubmissions,
    loadRemoteRouteVerifiedStops
  ]);

  useEffect(() => {
    if (!hasStopSyncConfig() && !hasRouteGeometrySyncConfig()) {
      return;
    }

    const handleOnline = () => {
      void Promise.all([
        loadRemoteRouteSubmissions(baseActiveRoute.id),
        loadRemoteRouteVerifiedStops(baseActiveRoute.id),
        loadRemoteGeometryLandmarks(baseActiveRoute.id),
        loadRemoteGeometrySegments(baseActiveRoute.id)
      ]);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [
    baseActiveRoute.id,
    loadRemoteGeometryLandmarks,
    loadRemoteGeometrySegments,
    loadRemoteRouteSubmissions,
    loadRemoteRouteVerifiedStops
  ]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const applyShiftActivityUpdate = useCallback(
    (shift: ShiftRecord, occurredAt = Date.now(), options?: { showMotivation?: boolean }) => {
      if (shift.status !== 'open') {
        return shift;
      }

      const lastActivityAt = shift.lastActivityAt ?? shift.startedAt;
      const elapsedMs = Math.max(0, occurredAt - lastActivityAt);
      const additionalUsageMs = Math.min(elapsedMs, ACTIVE_APP_IDLE_WINDOW_MS);
      const nextActiveUsageMs = shift.activeUsageMs + additionalUsageMs;
      const nextEncouragementCount =
        options?.showMotivation === false
          ? shift.encouragementCount
          : Math.max(shift.encouragementCount, Math.floor(nextActiveUsageMs / MOTIVATION_INTERVAL_MS));
      const shouldShowMotivation =
        options?.showMotivation !== false && nextEncouragementCount > shift.encouragementCount;
      const updatedShift: ShiftRecord = {
        ...shift,
        activeUsageMs: nextActiveUsageMs,
        lastActivityAt: occurredAt,
        encouragementCount: nextEncouragementCount
      };

      setShiftHistory(prev => prev.map(entry => (entry.id === shift.id ? updatedShift : entry)));
      currentShiftRef.current = updatedShift;

      if (shouldShowMotivation) {
        showToast("You're doing great. Your entries are still being saved.", 'info');
      }

      return updatedShift;
    },
    [showToast]
  );

  const recordCurrentShiftActivity = useCallback(
    (occurredAt = Date.now(), options?: { showMotivation?: boolean }) => {
      const openShift = currentShiftRef.current;
      if (!openShift) {
        return null;
      }

      return applyShiftActivityUpdate(openShift, occurredAt, options);
    },
    [applyShiftActivityUpdate]
  );

  const startShift = useCallback((mode: 'manual' | 'auto' = 'manual', options?: { silent?: boolean }) => {
    if (currentShift) {
      if (currentShift.routeId !== baseActiveRoute.id) {
        if (!options?.silent) {
          showToast(`Finish the open ${currentShift.routeLabel} shift first.`, 'info');
        }
        return currentShift;
      }

      const refreshedShift = applyShiftActivityUpdate(currentShift, Date.now(), { showMotivation: false });
      const existingSession = sessions.find(session => session.shiftId === currentShift.id);
      const openRouteSession = sessions.find(
        session => session.routeId === baseActiveRoute.id && session.status === 'open'
      );

      if (existingSession) {
        setTallyNav({
          sessionId: existingSession.id,
          tripIdx: 0,
          sheetIdx: 0,
          blockIdx: 0
        });
      } else if (openRouteSession) {
        setSessions(prev =>
          prev.map(session =>
            session.id === openRouteSession.id ? { ...session, shiftId: currentShift.id } : session
          )
        );
        setTallyNav({
          sessionId: openRouteSession.id,
          tripIdx: 0,
          sheetIdx: 0,
          blockIdx: 0
        });
      }

      if (!options?.silent) {
        showToast('Current shift is already open.', 'info');
      }
      return refreshedShift;
    }

    const nextShift = createShiftRecord(
      baseActiveRoute.id,
      baseActiveRoute.label,
      authState.employeeId,
      authState.employeeName,
      mode
    );
    const openRouteSession = sessions.find(
      session => session.routeId === baseActiveRoute.id && session.status === 'open'
    );

    setShiftHistory(prev => [nextShift, ...prev]);
    currentShiftRef.current = nextShift;

    if (openRouteSession) {
      setSessions(prev =>
        prev.map(session =>
          session.id === openRouteSession.id ? { ...session, shiftId: nextShift.id } : session
        )
      );
      setTallyNav({
        sessionId: openRouteSession.id,
        tripIdx: 0,
        sheetIdx: 0,
        blockIdx: 0
      });
    } else if (mode === 'manual') {
      const nextSession = createDefaultSession(baseActiveRoute.id, baseActiveRoute.label, nextShift.id);
      setSessions(prev => [nextSession, ...prev]);
      setTallyNav({
        sessionId: nextSession.id,
        tripIdx: 0,
        sheetIdx: 0,
        blockIdx: 0
      });
    }

    if (!options?.silent) {
      showToast(
        mode === 'auto'
          ? `Session started automatically for ${baseActiveRoute.shortLabel}`
          : `Shift started for ${baseActiveRoute.shortLabel}`
      );
    }

    return nextShift;
  }, [
    activeRoute.id,
    applyShiftActivityUpdate,
    authState.employeeId,
    authState.employeeName,
    baseActiveRoute.id,
    baseActiveRoute.label,
    baseActiveRoute.shortLabel,
    currentShift,
    sessions,
    setSessions,
    setTallyNav,
    showToast
  ]);

  const endShift = useCallback((options?: { silent?: boolean }) => {
    if (!currentShift) {
      if (!options?.silent) {
        showToast('No active shift to end.', 'info');
      }
      return null;
    }

    const activityUpdatedShift = applyShiftActivityUpdate(currentShift, Date.now(), { showMotivation: false });
    const endedAt = Date.now();
    const closedShift: ShiftRecord = {
      ...activityUpdatedShift,
      status: 'closed',
      endedAt,
      lastActivityAt: endedAt
    };

    setShiftHistory(prev => prev.map(shift => (shift.id === currentShift.id ? closedShift : shift)));
    currentShiftRef.current = null;
    setSessions(prev =>
      prev.map(session =>
        session.shiftId === currentShift.id
          ? { ...session, status: 'closed' }
          : session
      )
    );

    const shiftSessionIds = new Set(
      sessions.filter(session => session.shiftId === currentShift.id).map(session => session.id)
    );

    if (shiftSessionIds.has(tallyNav.sessionId)) {
      setTallyNav({
        sessionId: '',
        tripIdx: 0,
        sheetIdx: 0,
        blockIdx: 0
      });
    }

    if (!options?.silent) {
      showToast(`Shift ended for ${currentShift.routeLabel}`);
    }
    return closedShift;
  }, [applyShiftActivityUpdate, currentShift, sessions, setSessions, setTallyNav, showToast, tallyNav.sessionId]);

  useEffect(() => {
    if (!authState.isAuthenticated || !currentShift) {
      return;
    }

    const markActivity = () => {
      void recordCurrentShiftActivity(Date.now(), { showMotivation: true });
    };

    const flushActivityOnHide = () => {
      if (document.visibilityState === 'hidden') {
        void recordCurrentShiftActivity(Date.now(), { showMotivation: false });
      }
    };

    window.addEventListener('pointerdown', markActivity, { passive: true });
    window.addEventListener('keydown', markActivity);
    window.addEventListener('touchstart', markActivity, { passive: true });
    window.addEventListener('focus', markActivity);
    document.addEventListener('visibilitychange', flushActivityOnHide);

    return () => {
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('touchstart', markActivity);
      window.removeEventListener('focus', markActivity);
      document.removeEventListener('visibilitychange', flushActivityOnHide);
    };
  }, [authState.isAuthenticated, currentShift, recordCurrentShiftActivity]);

  const addRecord = (record: Omit<FareRecord, 'id' | 'timestamp'>) => {
    const routeId = record.routeId ?? activeRoute.id;
    const routeLabel = record.routeLabel ?? activeRoute.label;
    const ensuredShift =
      routeId === baseActiveRoute.id
        ? currentShift?.routeId === routeId
          ? applyShiftActivityUpdate(currentShift, Date.now(), { showMotivation: false })
          : startShift('auto', { silent: true })
        : null;
    const shiftId = routeId === (ensuredShift?.routeId ?? currentShift?.routeId)
      ? ensuredShift?.id ?? currentShift?.id ?? null
      : null;
    const newRecord: FareRecord = {
      ...record,
      routeId,
      routeLabel,
      shiftId,
      id: `rec-${Date.now()}`,
      timestamp: Date.now()
    };

    setHistory(prev => [newRecord, ...prev]);
    void trackAnalyticsEvent({
      eventType: 'fare_recorded',
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      routeId: newRecord.routeId ?? null,
      routeLabel: newRecord.routeLabel ?? null,
      appSurface: record.type === 'tally' ? 'between-stops' : 'fare',
      metadata: {
        origin: newRecord.origin,
        destination: newRecord.destination,
        distance: newRecord.distance,
        regularFare: newRecord.regularFare,
        discountedFare: newRecord.discountedFare,
        punchedFareType: newRecord.punchedFareType ?? null,
        isFavorite: newRecord.isFavorite,
        recordType: newRecord.type ?? 'calc',
        shiftId: newRecord.shiftId
      }
    });
  };

  const toggleFavorite = (id: string) => {
    setHistory(prev => prev.map(record => (record.id === id ? { ...record, isFavorite: !record.isFavorite } : record)));
  };

  const deleteHistory = () => {
    if (window.confirm('Clear all logs? This cannot be undone.')) {
      setHistory([]);
    }
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
    void Promise.all([
      loadRemoteRouteSubmissions(route.id),
      loadRemoteRouteVerifiedStops(route.id),
      loadRemoteGeometryLandmarks(route.id),
      loadRemoteGeometrySegments(route.id)
    ]);
    void trackAnalyticsEvent({
      eventType: 'route_selected',
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      routeId: route.id,
      routeLabel: route.label,
      appSurface: 'route-selection',
      metadata: {
        shortLabel: route.shortLabel
      }
    });
  };

  const saveRouteFareOverride = useCallback((routeId: string, fareOverride: Partial<RouteFareRules>) => {
    setRouteOverrides(prev => ({
      ...prev,
      [routeId]: {
        ...prev[routeId],
        fare: {
          ...(prev[routeId]?.fare ?? {}),
          ...fareOverride
        }
      }
    }));
  }, []);

  const saveStopOverride = useCallback((routeId: string, stopName: string, stopOverride: StopOverride) => {
    setRouteOverrides(prev => ({
      ...prev,
      [routeId]: {
        ...prev[routeId],
        stops: {
          ...(prev[routeId]?.stops ?? {}),
          [stopName]: {
            ...(prev[routeId]?.stops?.[stopName] ?? {}),
            ...stopOverride
          }
        }
      }
    }));
  }, []);

  const resetRouteOverrides = useCallback((routeId: string) => {
    setRouteOverrides(prev => {
      if (!prev[routeId]) {
        return prev;
      }

      const nextOverrides = { ...prev };
      delete nextOverrides[routeId];
      return nextOverrides;
    });
  }, []);

  const addStopSubmission: AppContextType['addStopSubmission'] = ({
    stopName,
    latitude,
    longitude,
    accuracyMeters,
    radiusMeters,
    sampleCount,
    source,
    notes
  }) => {
    const submission: StopSubmission = {
      id: createStopSubmissionId(),
      routeId: baseActiveRoute.id,
      routeLabel: baseActiveRoute.label,
      stopName,
      latitude,
      longitude,
      accuracyMeters,
      radiusMeters,
      sampleCount,
      source,
      syncStatus: 'pending',
      createdAt: Date.now(),
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      ...(notes ? { notes } : {})
    };

    setStopSubmissions(prev => [submission, ...prev]);
  };

  const syncStopSubmissions = useCallback(async () => {
    if (!hasStopSyncConfig() || !navigator.onLine) {
      setStopSyncState(prev => ({
        ...prev,
        enabled: hasStopSyncConfig()
      }));
      return false;
    }

    const pendingSubmissions = stopSubmissions.filter(submission => submission.syncStatus !== 'synced');

    setStopSyncState(prev => ({
      ...prev,
      enabled: true,
      isSyncing: true,
      lastError: null
    }));

    try {
      const syncedIds = pendingSubmissions.length > 0 ? await uploadStopSubmissions(pendingSubmissions) : [];

      if (syncedIds.length > 0) {
        setStopSubmissions(prev =>
          prev.map(submission =>
            syncedIds.includes(submission.id)
              ? { ...submission, syncStatus: 'synced' }
              : submission
          )
        );
      }

      const routeIdsToRefresh = [...new Set([baseActiveRoute.id, ...pendingSubmissions.map(submission => submission.routeId)])];
      const remoteByRoute = await Promise.all(
        routeIdsToRefresh.map(async routeId => ({
          routeId,
          submissions: await fetchRouteStopSubmissions(routeId)
        }))
      );
      const verifiedPayload = remoteByRoute.flatMap(({ routeId, submissions }) => {
        const route = getReadyRouteById(routeId);

        if (!route) {
          return [];
        }

        return buildVerifiedStopsFromSubmissions(route.id, route.label, route.stops, submissions);
      });

      const currentRouteSubmissions =
        remoteByRoute.find(entry => entry.routeId === baseActiveRoute.id)?.submissions ?? [];
      setRemoteStopSubmissions(currentRouteSubmissions);

      if (verifiedPayload.length > 0) {
        await upsertVerifiedStops(verifiedPayload);
      }

      const currentRouteVerifiedStops = await loadRemoteRouteVerifiedStops(baseActiveRoute.id);
      setStopSyncState(prev => ({
        ...prev,
        enabled: true,
        isSyncing: false,
        lastError: null,
        lastSyncedAt: Date.now(),
        remoteCount: currentRouteSubmissions.length,
        verifiedCount: currentRouteVerifiedStops.length
      }));
      return true;
    } catch (error) {
      setStopSyncState(prev => ({
        ...prev,
        enabled: true,
        isSyncing: false,
        lastError: error instanceof Error ? error.message : 'Unable to sync stop submissions right now.'
      }));
      return false;
    }
  }, [baseActiveRoute.id, loadRemoteRouteVerifiedStops, stopSubmissions]);

  useEffect(() => {
    if (!hasStopSyncConfig() || !navigator.onLine) {
      return;
    }

    const pendingCount = stopSubmissions.filter(submission => submission.syncStatus !== 'synced').length;

    if (pendingCount === 0) {
      return;
    }

    void syncStopSubmissions();
  }, [stopSubmissions, syncStopSubmissions]);

  return (
    <AppContext.Provider value={{
      routes: ROUTES,
      activeRoute,
      routeLandmarks,
      routeSegments,
      selectRoute,
      routeOverrides,
      saveRouteFareOverride,
      saveStopOverride,
      resetRouteOverrides,
      settings,
      setSettings,
      origin,
      setOrigin,
      destination,
      setDestination,
      history,
      addRecord,
      toggleFavorite,
      deleteHistory,
      activeFare,
      setActiveFare,
      sessions,
      setSessions,
      tallyNav,
      setTallyNav,
      stopSubmissions,
      verifiedStops,
      addStopSubmission,
      syncStopSubmissions,
      stopSyncState,
      currentShift,
      shiftHistory,
      startShift,
      endShift,
      stopReminders,
      setStopReminders,
      reminderSettings,
      setReminderSettings,
      showToast
    }}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+80px)] z-[200] flex justify-center px-4">
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-black shadow-2xl ${
              toast.type === 'info'
                ? 'bg-zinc-900 text-white'
                : 'bg-emerald-500 text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
