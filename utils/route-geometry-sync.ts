import type { RouteLandmark, RouteSegment } from '../types';

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

const mapRouteLandmarkToPayload = (landmark: RouteLandmark) => ({
  route_id: landmark.routeId,
  route_label: landmark.routeLabel,
  stop_name: landmark.stopName,
  km: landmark.km,
  latitude: landmark.latitude,
  longitude: landmark.longitude,
  radius_meters: landmark.radiusMeters,
  google_place_id: landmark.googlePlaceId,
  google_maps_query: landmark.googleMapsQuery,
  aliases: landmark.aliases,
  source: landmark.source,
  confidence_score: landmark.confidenceScore,
  updated_at: new Date(landmark.updatedAt || Date.now()).toISOString()
});

const mapPayloadToRouteLandmark = (payload: Record<string, unknown>): RouteLandmark => ({
  id: String(payload.id ?? `${payload.route_id ?? 'route'}-${payload.stop_name ?? 'stop'}`),
  routeId: String(payload.route_id ?? ''),
  routeLabel: String(payload.route_label ?? ''),
  stopName: String(payload.stop_name ?? ''),
  km: Number(payload.km ?? 0),
  latitude: payload.latitude == null ? null : Number(payload.latitude),
  longitude: payload.longitude == null ? null : Number(payload.longitude),
  radiusMeters: payload.radius_meters == null ? null : Number(payload.radius_meters),
  googlePlaceId: payload.google_place_id ? String(payload.google_place_id) : null,
  googleMapsQuery: payload.google_maps_query ? String(payload.google_maps_query) : null,
  aliases: Array.isArray(payload.aliases) ? payload.aliases.map(value => String(value)) : [],
  source:
    payload.source === 'manual' || payload.source === 'place-search' || payload.source === 'road-snapped'
      ? payload.source
      : 'seeded',
  confidenceScore: Number(payload.confidence_score ?? 0),
  updatedAt: payload.updated_at ? Date.parse(String(payload.updated_at)) : Date.now()
});

const mapRouteSegmentToPayload = (segment: RouteSegment) => ({
  route_id: segment.routeId,
  route_label: segment.routeLabel,
  start_stop_name: segment.startStopName,
  end_stop_name: segment.endStopName,
  start_km: segment.startKm,
  end_km: segment.endKm,
  path_points: segment.pathPoints,
  source: segment.source,
  confidence_score: segment.confidenceScore,
  updated_at: new Date(segment.updatedAt || Date.now()).toISOString()
});

const mapPayloadToRouteSegment = (payload: Record<string, unknown>): RouteSegment => ({
  id: String(payload.id ?? `${payload.route_id ?? 'route'}-${payload.start_stop_name ?? 'start'}-${payload.end_stop_name ?? 'end'}`),
  routeId: String(payload.route_id ?? ''),
  routeLabel: String(payload.route_label ?? ''),
  startStopName: String(payload.start_stop_name ?? ''),
  endStopName: String(payload.end_stop_name ?? ''),
  startKm: Number(payload.start_km ?? 0),
  endKm: Number(payload.end_km ?? 0),
  pathPoints: Array.isArray(payload.path_points)
    ? payload.path_points
        .map(point => {
          if (!point || typeof point !== 'object') {
            return null;
          }
          const latitude = Number((point as Record<string, unknown>).latitude ?? NaN);
          const longitude = Number((point as Record<string, unknown>).longitude ?? NaN);
          return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
        })
        .filter((point): point is { latitude: number; longitude: number } => Boolean(point))
    : [],
  source: payload.source === 'manual' || payload.source === 'road-snapped' ? payload.source : 'seeded',
  confidenceScore: Number(payload.confidence_score ?? 0),
  updatedAt: payload.updated_at ? Date.parse(String(payload.updated_at)) : Date.now()
});

export const hasRouteGeometrySyncConfig = () => Boolean(getSupabaseConfig());

export const fetchRouteLandmarks = async (routeId: string) => {
  const config = getSupabaseConfig();

  if (!config || !isBrowser() || !routeId) {
    return [];
  }

  const query = new URLSearchParams({
    select: '*',
    route_id: `eq.${routeId}`,
    order: 'km.asc'
  });

  const response = await fetch(`${config.url}/rest/v1/route_landmarks?${query.toString()}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Route landmark fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>[];
  return payload.map(mapPayloadToRouteLandmark);
};

export const upsertRouteLandmarks = async (landmarks: RouteLandmark[]) => {
  const config = getSupabaseConfig();

  if (!config || !isBrowser() || landmarks.length === 0) {
    return [];
  }

  const response = await fetch(`${config.url}/rest/v1/route_landmarks?on_conflict=route_id,stop_name`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(landmarks.map(mapRouteLandmarkToPayload))
  });

  if (!response.ok) {
    throw new Error(`Route landmark sync failed: ${response.status}`);
  }

  return landmarks.map(landmark => landmark.id);
};

export const fetchRouteSegments = async (routeId: string) => {
  const config = getSupabaseConfig();

  if (!config || !isBrowser() || !routeId) {
    return [];
  }

  const query = new URLSearchParams({
    select: '*',
    route_id: `eq.${routeId}`,
    order: 'start_km.asc'
  });

  const response = await fetch(`${config.url}/rest/v1/route_segments?${query.toString()}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Route segment fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>[];
  return payload.map(mapPayloadToRouteSegment);
};

export const upsertRouteSegments = async (segments: RouteSegment[]) => {
  const config = getSupabaseConfig();

  if (!config || !isBrowser() || segments.length === 0) {
    return [];
  }

  const response = await fetch(`${config.url}/rest/v1/route_segments?on_conflict=route_id,start_stop_name,end_stop_name`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(segments.map(mapRouteSegmentToPayload))
  });

  if (!response.ok) {
    throw new Error(`Route segment sync failed: ${response.status}`);
  }

  return segments.map(segment => segment.id);
};
