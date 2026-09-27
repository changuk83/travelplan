import type { Place, RouteEndpoint } from "./types";

export type MapRouteScope = { userId: number; tripId: string; dayId: string; mode: "schedule" | "preview" };
export type MapRouteSnapshot = { key: string; path: number[][] };
const EMPTY_PATH: number[][] = [];

/** Also used as the request body: unrelated memo/category changes do not reload the route. */
export function mapRouteKey(start: RouteEndpoint, goal: RouteEndpoint, places: Place[], cacheScope?: MapRouteScope) {
  const point = (value: RouteEndpoint) => ({ name: value.name, longitude: value.longitude, latitude: value.latitude });
  return JSON.stringify({ start: point(start), goal: point(goal), waypoints: places.map(point), cacheScope });
}

export function currentMapPath(snapshot: MapRouteSnapshot | null, key: string): number[][] {
  return snapshot?.key === key ? snapshot.path : EMPTY_PATH;
}

export function validMapPath(value: unknown): number[][] {
  if (!Array.isArray(value)) return EMPTY_PATH;
  return value.every(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      Math.abs(point[0]) <= 180 &&
      Math.abs(point[1]) <= 90,
  )
    ? value
    : EMPTY_PATH;
}
