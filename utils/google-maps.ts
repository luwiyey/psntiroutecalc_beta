import type { CurrentLocationSnapshot } from './location';
import type { Stop } from '../types';

const MAPS_BASE_URL = 'https://www.google.com/maps';
const APP_UTM_SOURCE = 'psnti_routecalc';

const addUtm = (params: URLSearchParams, campaign: string) => {
  params.set('utm_source', APP_UTM_SOURCE);
  params.set('utm_campaign', campaign);
};

const cleanQuery = (value: string) => value.trim().replace(/\s+/g, ' ');

export const buildStopMapsQuery = (stop: Stop, routeLabel: string) =>
  cleanQuery(stop.googleMapsQuery ?? `${stop.name} ${routeLabel} Philippines`);

export const buildGoogleMapsSearchUrl = (query: string, placeId?: string | null) => {
  const params = new URLSearchParams({
    api: '1',
    query: cleanQuery(query)
  });

  if (placeId) {
    params.set('query_place_id', placeId);
  }

  addUtm(params, 'place_details_search');
  return `${MAPS_BASE_URL}/search/?${params.toString()}`;
};

export const buildGoogleMapsPointUrl = (
  latitude: number,
  longitude: number,
  placeId?: string | null
) => buildGoogleMapsSearchUrl(`${latitude},${longitude}`, placeId);

export const buildGoogleMapsDirectionsUrl = ({
  destination,
  destinationPlaceId,
  origin,
  travelmode = 'driving',
  navigate = false
}: {
  destination: string;
  destinationPlaceId?: string | null;
  origin?: string | null;
  travelmode?: 'driving' | 'walking' | 'transit' | 'bicycling';
  navigate?: boolean;
}) => {
  const params = new URLSearchParams({
    api: '1',
    destination: cleanQuery(destination),
    travelmode
  });

  if (origin) {
    params.set('origin', cleanQuery(origin));
  }

  if (destinationPlaceId) {
    params.set('destination_place_id', destinationPlaceId);
  }

  if (navigate) {
    params.set('dir_action', 'navigate');
  }

  addUtm(params, navigate ? 'directions_navigate' : 'directions_request');
  return `${MAPS_BASE_URL}/dir/?${params.toString()}`;
};

export const openGoogleMapsUrl = (url: string) => {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const openStopInGoogleMaps = (stop: Stop, routeLabel: string) => {
  openGoogleMapsUrl(buildGoogleMapsSearchUrl(buildStopMapsQuery(stop, routeLabel), stop.googlePlaceId));
};

export const openDirectionsToStop = (stop: Stop, routeLabel: string) => {
  openGoogleMapsUrl(
    buildGoogleMapsDirectionsUrl({
      destination: buildStopMapsQuery(stop, routeLabel),
      destinationPlaceId: stop.googlePlaceId,
      navigate: true
    })
  );
};

export const openPointInGoogleMaps = (location: CurrentLocationSnapshot) => {
  openGoogleMapsUrl(buildGoogleMapsPointUrl(location.latitude, location.longitude));
};
