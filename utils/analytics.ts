export type AnalyticsEventType =
  | 'login'
  | 'logout'
  | 'route_selected'
  | 'fare_recorded'
  | 'gps_requested'
  | 'gps_succeeded'
  | 'gps_failed'
  | 'open_in_chrome'
  | 'tally_saved'
  | 'tally_box_cleared'
  | 'pwd_checker_opened'
  | 'audit_exported'
  | 'install_prompt_available'
  | 'app_installed'
  | 'update_available'
  | 'update_refresh_requested';

export interface AnalyticsEvent {
  event_id: string;
  event_type: AnalyticsEventType;
  created_at: string;
  employee_id: string | null;
  employee_name: string | null;
  device_id: string | null;
  route_id: string | null;
  route_label: string | null;
  app_surface: string | null;
  metadata: Record<string, unknown>;
}

interface TrackEventInput {
  eventType: AnalyticsEventType;
  employeeId?: string | null;
  employeeName?: string | null;
  deviceId?: string | null;
  routeId?: string | null;
  routeLabel?: string | null;
  appSurface?: string | null;
  metadata?: Record<string, unknown>;
}

const ANALYTICS_QUEUE_KEY = 'psnti_analytics_queue_v1';
const ANALYTICS_RECENT_KEY = 'psnti_analytics_recent_v1';
const RECENT_EVENTS_LIMIT = 250;

const env = (import.meta as ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
}).env ?? {};

const getSupabaseConfig = () => {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : undefined;
  const anonKey =
    typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string'
      ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
      : typeof env.VITE_SUPABASE_ANON_KEY === 'string'
        ? env.VITE_SUPABASE_ANON_KEY.trim()
        : undefined;

  if (!url || !anonKey) return null;

  return { url, anonKey };
};

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const createEventId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const readStoredEvents = (storageKey: string): AnalyticsEvent[] => {
  if (!isBrowser()) return [];

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStoredEvents = (storageKey: string, events: AnalyticsEvent[]) => {
  if (!isBrowser()) return;
  localStorage.setItem(storageKey, JSON.stringify(events));
};

const appendRecentEvent = (event: AnalyticsEvent) => {
  const recent = readStoredEvents(ANALYTICS_RECENT_KEY);
  const nextRecent = [event, ...recent].slice(0, RECENT_EVENTS_LIMIT);
  writeStoredEvents(ANALYTICS_RECENT_KEY, nextRecent);
};

const enqueueEvent = (event: AnalyticsEvent) => {
  const queue = readStoredEvents(ANALYTICS_QUEUE_KEY);
  writeStoredEvents(ANALYTICS_QUEUE_KEY, [...queue, event]);
};

const dequeueEvents = (eventIds: string[]) => {
  const queued = readStoredEvents(ANALYTICS_QUEUE_KEY);
  writeStoredEvents(
    ANALYTICS_QUEUE_KEY,
    queued.filter(event => !eventIds.includes(event.event_id))
  );
};

const sendEventsToSupabase = async (events: AnalyticsEvent[]) => {
  const config = getSupabaseConfig();
  if (!config || events.length === 0) return false;

  const response = await fetch(`${config.url}/rest/v1/analytics_events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(events)
  });

  if (!response.ok) {
    throw new Error(`Analytics upload failed: ${response.status}`);
  }

  return true;
};

export const flushAnalyticsQueue = async () => {
  if (!isBrowser() || !navigator.onLine) return false;

  const config = getSupabaseConfig();
  if (!config) return false;

  const queued = readStoredEvents(ANALYTICS_QUEUE_KEY);
  if (queued.length === 0) return true;

  await sendEventsToSupabase(queued);
  dequeueEvents(queued.map(event => event.event_id));
  return true;
};

export const trackAnalyticsEvent = async ({
  eventType,
  employeeId = null,
  employeeName = null,
  deviceId = null,
  routeId = null,
  routeLabel = null,
  appSurface = null,
  metadata = {}
}: TrackEventInput) => {
  const event: AnalyticsEvent = {
    event_id: createEventId(),
    event_type: eventType,
    created_at: new Date().toISOString(),
    employee_id: employeeId,
    employee_name: employeeName,
    device_id: deviceId,
    route_id: routeId,
    route_label: routeLabel,
    app_surface: appSurface,
    metadata: {
      ...metadata,
      page: isBrowser() ? window.location.pathname : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      language: typeof navigator !== 'undefined' ? navigator.language : null,
      online: typeof navigator !== 'undefined' ? navigator.onLine : null
    }
  };

  appendRecentEvent(event);

  const config = getSupabaseConfig();
  if (!config || !isBrowser() || !navigator.onLine) {
    if (config) enqueueEvent(event);
    return;
  }

  try {
    await sendEventsToSupabase([event]);
  } catch {
    enqueueEvent(event);
  }
};

export const getRecentAnalyticsEvents = () => readStoredEvents(ANALYTICS_RECENT_KEY);
