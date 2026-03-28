import type { CurrentLocationSnapshot } from './location';

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

export interface SnappedRoadPoint {
  latitude: number;
  longitude: number;
  placeId: string | null;
  source: 'google-roads';
}

export const hasGoogleMapsAssistConfig = () => Boolean(getSupabaseConfig());

export const snapLocationToRoad = async (
  samples: Pick<CurrentLocationSnapshot, 'latitude' | 'longitude'>[]
): Promise<SnappedRoadPoint | null> => {
  const config = getSupabaseConfig();

  if (!config || !isBrowser() || samples.length === 0) {
    return null;
  }

  const response = await fetch(`${config.url}/functions/v1/google-maps-assist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`
    },
    body: JSON.stringify({
      action: 'snap-road',
      samples: samples.map(sample => ({
        latitude: sample.latitude,
        longitude: sample.longitude
      }))
    })
  });

  if (!response.ok) {
    throw new Error(`Google Maps assist failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    snappedPoint?: {
      latitude?: number;
      longitude?: number;
      placeId?: string | null;
    } | null;
  };

  if (!payload.snappedPoint) {
    return null;
  }

  return {
    latitude: Number(payload.snappedPoint.latitude ?? 0),
    longitude: Number(payload.snappedPoint.longitude ?? 0),
    placeId: payload.snappedPoint.placeId ? String(payload.snappedPoint.placeId) : null,
    source: 'google-roads'
  };
};
