import type { StopSubmission, VerifiedStop } from '../types';

const env = (import.meta as ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
}).env ?? {};

const getSupabaseConfig = () => {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const anonKey =
    typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string'
      ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
      : typeof env.VITE_SUPABASE_ANON_KEY === 'string'
        ? env.VITE_SUPABASE_ANON_KEY.trim()
        : '';

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
};

const isBrowser = () => typeof window !== 'undefined' && typeof fetch === 'function';

const mapSubmissionToPayload = (submission: StopSubmission) => ({
  client_submission_id: submission.id,
  route_id: submission.routeId,
  route_label: submission.routeLabel,
  stop_name: submission.stopName,
  latitude: submission.latitude,
  longitude: submission.longitude,
  accuracy_meters: submission.accuracyMeters,
  radius_meters: submission.radiusMeters,
  sample_count: submission.sampleCount,
  source: submission.source,
  employee_id: submission.employeeId,
  employee_name: submission.employeeName,
  device_id: submission.deviceId,
  notes: submission.notes ?? null,
  submitted_at: new Date(submission.createdAt).toISOString()
});

const mapPayloadToSubmission = (payload: Record<string, unknown>): StopSubmission => ({
  id: String(payload.client_submission_id ?? payload.id),
  routeId: String(payload.route_id ?? ''),
  routeLabel: String(payload.route_label ?? ''),
  stopName: String(payload.stop_name ?? ''),
  latitude: Number(payload.latitude ?? 0),
  longitude: Number(payload.longitude ?? 0),
  accuracyMeters: Number(payload.accuracy_meters ?? 0),
  radiusMeters: Number(payload.radius_meters ?? 60),
  sampleCount: Number(payload.sample_count ?? 1),
  source: payload.source === 'native' ? 'native' : 'browser',
  syncStatus: 'synced',
  createdAt: payload.submitted_at ? Date.parse(String(payload.submitted_at)) : Date.now(),
  employeeId: payload.employee_id ? String(payload.employee_id) : null,
  employeeName: payload.employee_name ? String(payload.employee_name) : null,
  deviceId: payload.device_id ? String(payload.device_id) : null,
  notes: payload.notes ? String(payload.notes) : undefined
});

const mapVerifiedStopToPayload = (stop: VerifiedStop) => ({
  route_id: stop.routeId,
  route_label: stop.routeLabel,
  stop_name: stop.stopName,
  latitude: stop.latitude,
  longitude: stop.longitude,
  radius_meters: stop.radiusMeters,
  sample_count: stop.sampleCount,
  submission_count: stop.submissionCount,
  confidence_score: stop.confidenceScore,
  source: stop.source,
  updated_at: new Date(stop.updatedAt).toISOString()
});

const mapPayloadToVerifiedStop = (payload: Record<string, unknown>): VerifiedStop => ({
  id: String(payload.id ?? `${payload.route_id ?? 'route'}-${payload.stop_name ?? 'stop'}`),
  routeId: String(payload.route_id ?? ''),
  routeLabel: String(payload.route_label ?? ''),
  stopName: String(payload.stop_name ?? ''),
  latitude: Number(payload.latitude ?? 0),
  longitude: Number(payload.longitude ?? 0),
  radiusMeters: Number(payload.radius_meters ?? 60),
  sampleCount: Number(payload.sample_count ?? 1),
  submissionCount: Number(payload.submission_count ?? 1),
  confidenceScore: Number(payload.confidence_score ?? 0),
  source: payload.source === 'manual' ? 'manual' : 'computed',
  updatedAt: payload.updated_at ? Date.parse(String(payload.updated_at)) : Date.now()
});

export const hasStopSyncConfig = () => Boolean(getSupabaseConfig());

export const uploadStopSubmissions = async (submissions: StopSubmission[]) => {
  const config = getSupabaseConfig();

  if (!config || !isBrowser() || submissions.length === 0) {
    return [];
  }

  const response = await fetch(`${config.url}/rest/v1/stop_submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(submissions.map(mapSubmissionToPayload))
  });

  if (!response.ok) {
    throw new Error(`Stop submission upload failed: ${response.status}`);
  }

  return submissions.map(submission => submission.id);
};

export const fetchRouteStopSubmissions = async (routeId: string) => {
  const config = getSupabaseConfig();

  if (!config || !isBrowser() || !routeId) {
    return [];
  }

  const query = new URLSearchParams({
    select: '*',
    route_id: `eq.${routeId}`,
    order: 'submitted_at.desc'
  });

  const response = await fetch(`${config.url}/rest/v1/stop_submissions?${query.toString()}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Stop submission fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>[];
  return payload.map(mapPayloadToSubmission);
};

export const upsertVerifiedStops = async (verifiedStops: VerifiedStop[]) => {
  const config = getSupabaseConfig();

  if (!config || !isBrowser() || verifiedStops.length === 0) {
    return [];
  }

  const response = await fetch(
    `${config.url}/rest/v1/verified_stops?on_conflict=route_id,stop_name`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(verifiedStops.map(mapVerifiedStopToPayload))
    }
  );

  if (!response.ok) {
    throw new Error(`Verified stop sync failed: ${response.status}`);
  }

  return verifiedStops.map(stop => stop.id);
};

export const fetchRouteVerifiedStops = async (routeId: string) => {
  const config = getSupabaseConfig();

  if (!config || !isBrowser() || !routeId) {
    return [];
  }

  const query = new URLSearchParams({
    select: '*',
    route_id: `eq.${routeId}`,
    order: 'updated_at.desc'
  });

  const response = await fetch(`${config.url}/rest/v1/verified_stops?${query.toString()}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Verified stop fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>[];
  return payload.map(mapPayloadToVerifiedStop);
};
