type Point = { longitude: number; latitude: number };
type NaverRoute = { path?: number[][]; summary?: { distance?: number; duration?: number }; guide?: Array<{ type?: number; distance?: number; duration?: number }> };
type RouteCacheScope = { userId?: number; tripId?: string; dayId?: string; mode?: "schedule" | "preview" };
type CloudflareCacheStorage = CacheStorage & { default: Cache };

const MAX_WAYPOINTS = 30;
const WAYPOINTS_PER_REQUEST = 5;
const ROUTE_CACHE_SECONDS = 60 * 60 * 6;

function routeCacheRequest(request: Request, points: Point[], scope?: RouteCacheScope) {
  const url = new URL("/__gildam-cache/routes/v1", request.url);
  url.searchParams.set("option", "traoptimal");
  url.searchParams.set("user", String(scope?.userId ?? "shared"));
  url.searchParams.set("trip", scope?.tripId ?? "unscoped");
  url.searchParams.set("day", scope?.dayId ?? "unscoped");
  url.searchParams.set("mode", scope?.mode ?? "schedule");
  url.searchParams.set("points", points.map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`).join("|"));
  return new Request(url, { method: "GET" });
}

function splitRoute(start: Point, waypoints: Point[], goal: Point) {
  const points = [start, ...waypoints, goal];
  const chunks: Point[][] = [];
  for (let index = 0; index < points.length - 1; index += WAYPOINTS_PER_REQUEST + 1) {
    chunks.push(points.slice(index, Math.min(index + WAYPOINTS_PER_REQUEST + 2, points.length)));
  }
  return chunks;
}

function routeLegs(route: NaverRoute) {
  const legs: Array<{ distance: number; duration: number }> = [];
  let distance = 0;
  let duration = 0;
  for (const guide of route.guide ?? []) {
    distance += guide.distance ?? 0;
    duration += guide.duration ?? 0;
    if (guide.type === 87 || guide.type === 88) {
      legs.push({ distance, duration });
      distance = 0;
      duration = 0;
    }
  }
  if (distance || duration) legs.push({ distance, duration });
  return legs;
}

export async function POST(request: Request) {
  const { waypoints = [], start, goal, cacheScope } = await request.json() as { waypoints?: Point[]; start?: Point; goal?: Point; cacheScope?: RouteCacheScope };
  if (waypoints.length > MAX_WAYPOINTS) return Response.json({ error: `경유지는 최대 ${MAX_WAYPOINTS}곳까지 추가할 수 있습니다.` }, { status: 400 });
  const routeStart = start ?? { longitude: 127.095, latitude: 37.322 };
  const routeGoal = goal ?? { longitude: 128.467, latitude: 38.378 };
  const cache = (globalThis.caches as CloudflareCacheStorage | undefined)?.default;
  const cacheRequest = routeCacheRequest(request, [routeStart, ...waypoints, routeGoal], cacheScope);
  if (cache) {
    try {
      const cached = await cache.match(cacheRequest);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-Gildam-Route-Cache", "HIT");
        return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
      }
    } catch {}
  }
  const id = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (!id || !secret) return Response.json({ error: "지도 API 키가 설정되지 않았습니다." }, { status: 500 });
  try {
    const responses = await Promise.all(splitRoute(routeStart, waypoints, routeGoal).map(async (points) => {
      const url = new URL("https://maps.apigw.ntruss.com/map-direction/v1/driving");
      url.searchParams.set("start", `${points[0].longitude},${points[0].latitude}`);
      url.searchParams.set("goal", `${points.at(-1)!.longitude},${points.at(-1)!.latitude}`);
      url.searchParams.set("option", "traoptimal");
      const intermediates = points.slice(1, -1);
      if (intermediates.length) url.searchParams.set("waypoints", intermediates.map((point) => `${point.longitude},${point.latitude}`).join("|"));
      const response = await fetch(url, { headers: { "x-ncp-apigw-api-key-id": id, "x-ncp-apigw-api-key": secret, Accept: "application/json" } });
      const data = await response.json() as { route?: { traoptimal?: NaverRoute[] }; message?: string };
      if (!response.ok) throw new Error(data.message || "경로를 계산하지 못했습니다.");
      return data.route?.traoptimal?.[0];
    }));
    const path: number[][] = [];
    const legs: Array<{ distance: number; duration: number }> = [];
    let distance = 0;
    let duration = 0;
    responses.forEach((route, index) => {
      path.push(...(index ? route?.path?.slice(1) ?? [] : route?.path ?? []));
      legs.push(...routeLegs(route ?? {}));
      distance += route?.summary?.distance ?? 0;
      duration += route?.summary?.duration ?? 0;
    });
    const response = Response.json({ path, summary: { distance, duration }, legs }, { headers: { "Cache-Control": `public, max-age=${ROUTE_CACHE_SECONDS}`, "X-Gildam-Route-Cache": "MISS" } });
    if (cache) try { await cache.put(cacheRequest, response.clone()); } catch {}
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "경로를 계산하지 못했습니다." }, { status: 502 });
  }
}
