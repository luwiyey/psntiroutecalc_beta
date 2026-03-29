const formatDistanceValue = (distance: number) => {
  if (!Number.isFinite(distance)) return '0';
  return distance % 1 === 0 ? distance.toFixed(0) : distance.toFixed(1);
};

export const getRouteEndpointDistances = (
  km: number,
  routeStartKm: number,
  routeEndKm: number
) => {
  const fromStart = Math.abs(km - routeStartKm);
  const toEnd = Math.abs(routeEndKm - km);

  return {
    fromStart,
    toEnd,
    fromStartText: formatDistanceValue(fromStart),
    toEndText: formatDistanceValue(toEnd)
  };
};

export const formatRouteEndpointSummary = (
  km: number,
  routeStartKm: number,
  routeEndKm: number,
  routeStartName: string,
  routeEndName: string
) => {
  const { fromStartText, toEndText } = getRouteEndpointDistances(km, routeStartKm, routeEndKm);
  return `${fromStartText} km from ${routeStartName} | ${toEndText} km to ${routeEndName}`;
};

export const formatRouteEndpointCompact = (
  km: number,
  routeStartKm: number,
  routeEndKm: number,
  routeStartName: string,
  routeEndName: string
) => {
  const { fromStartText, toEndText } = getRouteEndpointDistances(km, routeStartKm, routeEndKm);
  return `${fromStartText} from ${routeStartName} | ${toEndText} to ${routeEndName}`;
};
