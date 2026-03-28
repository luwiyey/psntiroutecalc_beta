const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface LatLngSample {
  latitude: number;
  longitude: number;
}

interface GooglePlaceCandidate {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });

const getDistanceMeters = (left: LatLngSample, right: LatLngSample) => {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLng = toRadians(right.longitude - left.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(left.latitude)) *
      Math.cos(toRadians(right.latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getCenterPoint = (samples: LatLngSample[]) => ({
  latitude: samples.reduce((sum, sample) => sum + sample.latitude, 0) / samples.length,
  longitude: samples.reduce((sum, sample) => sum + sample.longitude, 0) / samples.length
});

const handleSearchPlace = async (textQuery: string, apiKey: string) => {
  const trimmedQuery = textQuery.trim();

  if (!trimmedQuery) {
    return json({ error: 'A place search query is required.' }, 400);
  }

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
    },
    body: JSON.stringify({
      textQuery: trimmedQuery,
      pageSize: 5
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    return json({ error: 'Google Places API request failed.', detail }, 502);
  }

  const payload = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: {
        text?: string;
      };
      formattedAddress?: string;
      location?: {
        latitude?: number;
        longitude?: number;
      };
    }>;
  };

  const places: GooglePlaceCandidate[] = (payload.places ?? [])
    .map(place => ({
      placeId: String(place.id ?? ''),
      name: String(place.displayName?.text ?? ''),
      formattedAddress: String(place.formattedAddress ?? ''),
      latitude: Number(place.location?.latitude ?? NaN),
      longitude: Number(place.location?.longitude ?? NaN)
    }))
    .filter(place =>
      Boolean(place.placeId) &&
      Boolean(place.name) &&
      Number.isFinite(place.latitude) &&
      Number.isFinite(place.longitude)
    );

  return json({ places });
};

const handleSnapRoad = async (samples: LatLngSample[], apiKey: string) => {
  const uniqueSamples = samples
    .filter(sample => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude))
    .slice(0, 20);

  if (uniqueSamples.length === 0) {
    return json({ error: 'No valid coordinates supplied.' }, 400);
  }

  const path = uniqueSamples.map(sample => `${sample.latitude},${sample.longitude}`).join('|');
  const params = new URLSearchParams({
    path,
    interpolate: 'false',
    key: apiKey
  });

  const response = await fetch(`https://roads.googleapis.com/v1/snapToRoads?${params.toString()}`);
  if (!response.ok) {
    const detail = await response.text();
    return json({ error: 'Google Roads API request failed.', detail }, 502);
  }

  const payload = (await response.json()) as {
    snappedPoints?: Array<{
      placeId?: string;
      location?: {
        latitude?: number;
        longitude?: number;
      };
    }>;
  };

  const snappedPoints = (payload.snappedPoints ?? [])
    .map(point => ({
      latitude: Number(point.location?.latitude ?? NaN),
      longitude: Number(point.location?.longitude ?? NaN),
      placeId: point.placeId ? String(point.placeId) : null
    }))
    .filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

  if (snappedPoints.length === 0) {
    return json({ snappedPoint: null });
  }

  const center = getCenterPoint(uniqueSamples);
  const bestPoint = snappedPoints.reduce((best, point) => {
    if (!best) return point;
    return getDistanceMeters(center, point) < getDistanceMeters(center, best) ? point : best;
  }, snappedPoints[0]);

  return json({
    snappedPoint: {
      latitude: bestPoint.latitude,
      longitude: bestPoint.longitude,
      placeId: bestPoint.placeId
    }
  });
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) {
    return json({ error: 'GOOGLE_MAPS_API_KEY is not configured.' }, 503);
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      samples?: LatLngSample[];
      textQuery?: string;
    };

    if (body.action === 'snap-road') {
      return await handleSnapRoad(body.samples ?? [], apiKey);
    }

    if (body.action === 'search-place') {
      return await handleSearchPlace(body.textQuery ?? '', apiKey);
    }

    return json({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unexpected Google Maps assist error.' },
      500
    );
  }
});
