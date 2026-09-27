import { handleAiChat } from "../../server/ai-assistant";
import { sameRoutePoint, splitDrivingRoute } from "../../server/route-chunks";
import { handlePlaceReputation } from "../../server/place-reputation";
import { handleScheduleApi } from "./schedule-api";

type Env = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  AI_RATE_LIMITER: RateLimiter;
  DB: D1Database;
  SEARCH_RATE_LIMITER: RateLimiter;
  ROUTE_RATE_LIMITER: RateLimiter;
  STATE_READ_RATE_LIMITER: RateLimiter;
  STATE_WRITE_RATE_LIMITER: RateLimiter;
  ALLOWED_ORIGINS: string;
  NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: string;
  NAVER_MAP_CLIENT_SECRET: string;
  NAVER_SEARCH_CLIENT_ID: string;
  NAVER_SEARCH_CLIENT_SECRET: string;
  KAKAO_REST_API_KEY: string;
  GOOGLE_MAPS_API_KEY: string;
};

type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type Place = {
  id: string;
  name: string;
  category: string;
  address: string;
  longitude: number;
  latitude: number;
  link?: string;
  memo?: string;
  savedCategory?: string;
  savedCategories?: string[];
};

type NaverDirectionRoute = {
  path?: number[][];
  guide?: Array<{ distance?: number; duration?: number; type?: number }>;
  summary?: { distance?: number; duration?: number };
};
type NaverDirectionResponse = {
  message?: string;
  route?: { traoptimal?: NaverDirectionRoute[] };
};
type KakaoDocument = {
  id: string;
  place_name: string;
  category_name?: string;
  category_group_name?: string;
  road_address_name?: string;
  address_name?: string;
  x: string;
  y: string;
  place_url?: string;
};
type KakaoSearchResponse = { documents?: KakaoDocument[] };
type NaverLocalItem = {
  title?: string;
  category?: string;
  roadAddress?: string;
  address?: string;
  mapx?: string;
  mapy?: string;
  link?: string;
};
type NaverLocalResponse = { message?: string; items?: NaverLocalItem[] };
type NaverGeocodeAddress = { roadAddress?: string; jibunAddress?: string; x?: string; y?: string };
type NaverGeocodeResponse = { errorMessage?: string; message?: string; addresses?: NaverGeocodeAddress[] };
type GoogleRouteLeg = { distanceMeters?: number; duration?: string };
type GoogleRoute = {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
  legs?: GoogleRouteLeg[];
};
type GoogleError = { error?: { message?: string } };
type GoogleRoutesResponse = GoogleError & { routes?: GoogleRoute[] };
type GooglePlaceResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryTypeDisplayName?: { text?: string };
};
type GooglePlacesResponse = GoogleError & {
  places?: GooglePlaceResponse[];
  routingSummaries?: Array<{ legs?: GoogleRouteLeg[] }>;
};
type GoogleSearchPlace = {
  id?: string;
  name: string;
  address: string;
  category: string;
  location?: { latitude: number; longitude: number };
  detourDistanceMeters: number;
  detourDurationSeconds: number;
};

const DEFAULT_USER_ID = "1";
const ROUTE_CACHE_SECONDS = 60 * 60 * 6;
const edgeCache = (caches as CacheStorage & { default: Cache }).default;

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers ?? {}) },
  });
const clean = (value = "") => value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const coordinate = (value?: string) => {
  const n = Number(value);
  return Math.abs(n) > 180 ? n / 10_000_000 : n;
};
const distanceKm = (from: { longitude: number; latitude: number }, to: { longitude: number; latitude: number }) => {
  const radius = 6371;
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const value =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitude / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};
const validDevice = (value: string | null) => (value && /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : null);

async function enforceRateLimit(request: Request, limiter: RateLimiter) {
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await limiter.limit({ key: clientIp });
  return success
    ? null
    : json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "retry-after": "60" } },
      );
}

function cors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim());
  return allowed.includes(origin)
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
        "access-control-allow-headers": "content-type,x-gildam-device",
        vary: "Origin",
      }
    : {};
}

function routeCacheRequest(
  request: Request,
  points: Array<{ longitude: number; latitude: number }>,
  scope?: { tripId?: string; dayId?: string; mode?: "schedule" | "preview" },
) {
  const url = new URL("/__gildam-cache/routes/v3", request.url);
  url.searchParams.set("user", DEFAULT_USER_ID);
  url.searchParams.set("trip", scope?.tripId ?? "unscoped");
  url.searchParams.set("day", scope?.dayId ?? "unscoped");
  url.searchParams.set("mode", scope?.mode === "preview" ? "preview" : "schedule");
  url.searchParams.set("option", "traoptimal");
  url.searchParams.set(
    "points",
    points.map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`).join("|"),
  );
  return new Request(url, { method: "GET" });
}

function compactRoute(points: Array<{ longitude: number; latitude: number }>) {
  const compact = [points[0]];
  const duplicateLegs: boolean[] = [];
  for (let index = 1; index < points.length; index++) {
    const duplicate = sameRoutePoint(points[index - 1], points[index]);
    duplicateLegs.push(duplicate);
    if (!duplicate) compact.push(points[index]);
  }
  return { compact, duplicateLegs };
}

async function directions(request: Request, env: Env, ctx: ExecutionContext) {
  const {
    waypoints = [],
    start,
    goal,
    cacheScope,
  } = (await request.json()) as {
    waypoints?: Place[];
    start?: Place;
    goal?: Place;
    cacheScope?: { userId?: number; tripId?: string; dayId?: string; mode?: "schedule" | "preview" };
  };
  if (!env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || !env.NAVER_MAP_CLIENT_SECRET)
    return json({ error: "지도 API 키가 설정되지 않았습니다." }, { status: 500 });
  if (waypoints.length > 30) return json({ error: "경유지는 최대 30곳까지 추가할 수 있습니다." }, { status: 400 });
  const points = [
    start ?? { longitude: 127.095, latitude: 37.322 },
    ...waypoints,
    goal ?? { longitude: 128.467, latitude: 38.378 },
  ];
  const cacheRequest = routeCacheRequest(request, points, cacheScope);
  const cached = await edgeCache.match(cacheRequest);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("x-gildam-route-cache", "HIT");
    return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
  }
  const { compact: routePoints, duplicateLegs } = compactRoute(points);
  if (routePoints.length === 1) {
    const response = json(
      {
        path: [[routePoints[0].longitude, routePoints[0].latitude]],
        summary: { distance: 0, duration: 0 },
        legs: duplicateLegs.map(() => ({ distance: 0, duration: 0 })),
      },
      { headers: { "cache-control": `public, max-age=${ROUTE_CACHE_SECONDS}`, "x-gildam-route-cache": "MISS" } },
    );
    ctx.waitUntil(edgeCache.put(cacheRequest, response.clone()));
    return response;
  }
  const chunks = splitDrivingRoute(routePoints);
  const routes = await Promise.all(
    chunks.map(async (points) => {
      const url = new URL("https://maps.apigw.ntruss.com/map-direction/v1/driving");
      url.searchParams.set("start", `${points[0].longitude},${points[0].latitude}`);
      url.searchParams.set("goal", `${points.at(-1)!.longitude},${points.at(-1)!.latitude}`);
      url.searchParams.set("option", "traoptimal");
      const intermediates = points.slice(1, -1);
      if (intermediates.length)
        url.searchParams.set("waypoints", intermediates.map((p) => `${p.longitude},${p.latitude}`).join("|"));
      const response = await fetch(url, {
        headers: {
          "x-ncp-apigw-api-key-id": env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID,
          "x-ncp-apigw-api-key": env.NAVER_MAP_CLIENT_SECRET,
          accept: "application/json",
        },
      });
      const data = (await response.json()) as NaverDirectionResponse;
      if (!response.ok) throw new Error(data.message || "경로를 계산하지 못했습니다.");
      const route = data.route?.traoptimal?.[0];
      if (!route?.path?.length) throw new Error("경로를 계산하지 못했습니다.");
      return route;
    }),
  );
  const path: number[][] = [];
  const calculatedLegs: { distance: number; duration: number }[] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  routes.forEach((route, index) => {
    path.push(...(index ? (route?.path ?? []).slice(1) : (route?.path ?? [])));
    let distance = 0;
    let duration = 0;
    for (const guide of route?.guide ?? []) {
      distance += guide.distance ?? 0;
      duration += guide.duration ?? 0;
      if (guide.type === 87 || guide.type === 88) {
        calculatedLegs.push({ distance, duration });
        distance = 0;
        duration = 0;
      }
    }
    if (distance || duration) calculatedLegs.push({ distance, duration });
    totalDistance += route?.summary?.distance ?? 0;
    totalDuration += route?.summary?.duration ?? 0;
  });
  let calculatedIndex = 0;
  const legs = duplicateLegs.map((duplicate) =>
    duplicate ? { distance: 0, duration: 0 } : (calculatedLegs[calculatedIndex++] ?? { distance: 0, duration: 0 }),
  );
  const response = json(
    { path, summary: { distance: totalDistance, duration: totalDuration }, legs },
    { headers: { "cache-control": `public, max-age=${ROUTE_CACHE_SECONDS}`, "x-gildam-route-cache": "MISS" } },
  );
  ctx.waitUntil(edgeCache.put(cacheRequest, response.clone()));
  return response;
}

async function search(request: Request, env: Env) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim();
  if (!q || q.length < 2) return json({ error: "두 글자 이상 입력해 주세요." }, { status: 400 });
  const fromLng = params.get("fromLng"),
    fromLat = params.get("fromLat"),
    toLng = params.get("toLng"),
    toLat = params.get("toLat"),
    mainLng = params.get("mainLng"),
    mainLat = params.get("mainLat");
  const from = { longitude: Number(fromLng), latitude: Number(fromLat) };
  const to = { longitude: Number(toLng), latitude: Number(toLat) };
  const main = { longitude: Number(mainLng), latitude: Number(mainLat) };
  const hasFrom =
    fromLng !== null && fromLat !== null && Number.isFinite(from.longitude) && Number.isFinite(from.latitude);
  const hasTo = toLng !== null && toLat !== null && Number.isFinite(to.longitude) && Number.isFinite(to.latitude);
  const hasMain =
    mainLng !== null && mainLat !== null && Number.isFinite(main.longitude) && Number.isFinite(main.latitude);
  const kakaoPlaces: Place[] = [];
  if (env.KAKAO_REST_API_KEY && hasFrom) {
    try {
      const centers = [...(hasTo ? [from, to] : [from]), ...(hasMain ? [main] : [])];
      const responses = await Promise.all(
        centers.map(async (center) => {
          const kakaoUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
          kakaoUrl.searchParams.set("query", q);
          kakaoUrl.searchParams.set("x", String(center.longitude));
          kakaoUrl.searchParams.set("y", String(center.latitude));
          kakaoUrl.searchParams.set("radius", "20000");
          kakaoUrl.searchParams.set("size", "15");
          kakaoUrl.searchParams.set("sort", "distance");
          return fetch(kakaoUrl, { headers: { authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` } });
        }),
      );
      for (const response of responses) {
        if (!response.ok) continue;
        const data = (await response.json()) as KakaoSearchResponse;
        for (const item of data.documents ?? []) {
          if (kakaoPlaces.some((place) => place.id === `kakao-${item.id}`)) continue;
          kakaoPlaces.push({
            id: `kakao-${item.id}`,
            name: item.place_name,
            category: item.category_name || item.category_group_name || "장소",
            address: item.road_address_name || item.address_name || "",
            longitude: Number(item.x),
            latitude: Number(item.y),
            link: item.place_url || "",
          });
        }
      }
    } catch {
      // Kakao 검색 실패 시 네이버 검색으로 계속 진행한다.
    }
    if (hasMain) kakaoPlaces.sort((a, b) => distanceKm(main, a) - distanceKm(main, b));
    else if (hasTo)
      kakaoPlaces.sort((a, b) => distanceKm(from, a) + distanceKm(a, to) - (distanceKm(from, b) + distanceKm(b, to)));
    else kakaoPlaces.sort((a, b) => distanceKm(from, a) - distanceKm(from, b));
    if (kakaoPlaces.length >= 10) return json({ source: "kakao", places: kakaoPlaces.slice(0, 20) });
  }
  if (!env.NAVER_SEARCH_CLIENT_ID || !env.NAVER_SEARCH_CLIENT_SECRET) {
    if (kakaoPlaces.length) return json({ source: "kakao", places: kakaoPlaces });
    return json({ error: "장소 검색 API 키가 설정되지 않았습니다." }, { status: 500 });
  }
  const localUrl = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
  localUrl.searchParams.set("query", q);
  localUrl.searchParams.set("display", "5");
  localUrl.searchParams.set("format", "json");
  const localResponse = await fetch(localUrl, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": env.NAVER_SEARCH_CLIENT_ID,
      "X-NCP-APIGW-API-KEY": env.NAVER_SEARCH_CLIENT_SECRET,
    },
  });
  const localData = (await localResponse.json()) as NaverLocalResponse;
  if (!localResponse.ok)
    return json(
      { error: localData.message || `지역 검색 실패 (${localResponse.status})` },
      { status: localResponse.status },
    );
  const localPlaces = (localData.items ?? []).map((item, index) => ({
    id: `local-${index}-${item.mapx}`,
    name: clean(item.title),
    category: clean(item.category),
    address: item.roadAddress || item.address || "",
    longitude: coordinate(item.mapx),
    latitude: coordinate(item.mapy),
    link: item.link || "",
  }));
  if (kakaoPlaces.length) {
    const combined = [...kakaoPlaces];
    for (const place of localPlaces) {
      const duplicate = combined.some(
        (item) =>
          clean(item.name).replace(/\s/g, "") === clean(place.name).replace(/\s/g, "") ||
          (Boolean(item.address) && item.address === place.address),
      );
      if (!duplicate) combined.push(place);
    }
    if (hasMain) combined.sort((a, b) => distanceKm(main, a) - distanceKm(main, b));
    else if (hasTo)
      combined.sort((a, b) => distanceKm(from, a) + distanceKm(a, to) - (distanceKm(from, b) + distanceKm(b, to)));
    else combined.sort((a, b) => distanceKm(from, a) - distanceKm(from, b));
    return json({ source: localPlaces.length ? "mixed" : "kakao", places: combined.slice(0, 20) });
  }
  if (localPlaces.length) return json({ source: "local", places: localPlaces });

  if (!env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || !env.NAVER_MAP_CLIENT_SECRET)
    return json({ error: "주소 검색용 지도 API 키가 설정되지 않았습니다." }, { status: 500 });
  const geocodeUrl = new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
  geocodeUrl.searchParams.set("query", q);
  geocodeUrl.searchParams.set("count", "5");
  const geocodeResponse = await fetch(geocodeUrl, {
    headers: {
      "x-ncp-apigw-api-key-id": env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID,
      "x-ncp-apigw-api-key": env.NAVER_MAP_CLIENT_SECRET,
      accept: "application/json",
    },
  });
  const geocodeData = (await geocodeResponse.json()) as NaverGeocodeResponse;
  if (!geocodeResponse.ok)
    return json(
      { error: geocodeData.errorMessage || geocodeData.message || `주소 검색 실패 (${geocodeResponse.status})` },
      { status: geocodeResponse.status },
    );
  return json({
    source: "geocoding",
    places: (geocodeData.addresses ?? []).map((item, index) => ({
      id: `address-${index}-${item.x}`,
      name: item.roadAddress || item.jibunAddress || q,
      category: "주소",
      address: item.jibunAddress || item.roadAddress || "",
      longitude: Number(item.x),
      latitude: Number(item.y),
      link: "",
    })),
  });
}

async function googleRouteSearch(request: Request, env: Env) {
  if (!env.GOOGLE_MAPS_API_KEY)
    return json({ error: "Google 서버 API 키가 아직 설정되지 않았습니다." }, { status: 503 });
  const {
    query,
    start,
    goal,
    waypoints = [],
  } = (await request.json()) as {
    query?: string;
    start?: { latitude: number; longitude: number };
    goal?: { latitude: number; longitude: number };
    waypoints?: Array<{ latitude: number; longitude: number }>;
  };
  if (!start || !goal) return json({ error: "출발·도착 좌표가 필요합니다." }, { status: 400 });
  if (waypoints.length > 25)
    return json({ error: "Google 해외 경로의 경유지는 최대 25곳까지 추가할 수 있습니다." }, { status: 400 });
  const routeResponse = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask":
        "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration",
    },
    body: JSON.stringify({
      origin: { location: { latLng: start } },
      destination: { location: { latLng: goal } },
      intermediates: waypoints.map((point) => ({ location: { latLng: point } })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    }),
  });
  const routeData = (await routeResponse.json()) as GoogleRoutesResponse;
  if (!routeResponse.ok)
    return json(
      { error: routeData.error?.message || "Google 경로를 계산하지 못했습니다." },
      { status: routeResponse.status },
    );
  const route = routeData.routes?.[0];
  const encodedPolyline = route?.polyline?.encodedPolyline;
  if (!encodedPolyline) return json({ error: "Google 경로 결과가 없습니다." }, { status: 404 });
  const parseSeconds = (value?: string) => Number(value?.replace("s", "") ?? 0);
  let places: GoogleSearchPlace[] = [];
  if (query?.trim()) {
    const placesResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,routingSummaries",
      },
      body: JSON.stringify({
        textQuery: query.trim(),
        languageCode: "ko",
        maxResultCount: 15,
        searchAlongRouteParameters: { polyline: { encodedPolyline } },
        routingParameters: { origin: start },
      }),
    });
    const placesData = (await placesResponse.json()) as GooglePlacesResponse;
    if (!placesResponse.ok)
      return json(
        { error: placesData.error?.message || "Google 장소를 검색하지 못했습니다." },
        { status: placesResponse.status },
      );
    places = (placesData.places ?? []).map((place, index) => {
      const legs = placesData.routingSummaries?.[index]?.legs ?? [];
      return {
        id: place.id,
        name: place.displayName?.text ?? "이름 없는 장소",
        address: place.formattedAddress ?? "",
        category: place.primaryTypeDisplayName?.text ?? "장소",
        location: place.location,
        detourDistanceMeters: Math.max(
          0,
          legs.reduce((sum, leg) => sum + (leg.distanceMeters ?? 0), 0) - (route.distanceMeters ?? 0),
        ),
        detourDurationSeconds: Math.max(
          0,
          legs.reduce((sum, leg) => sum + parseSeconds(leg.duration), 0) - parseSeconds(route.duration),
        ),
      };
    });
  }
  return json({
    encodedPolyline,
    route: {
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds: parseSeconds(route.duration),
      legs: (route.legs ?? []).map((leg) => ({
        distanceMeters: leg.distanceMeters ?? 0,
        durationSeconds: parseSeconds(leg.duration),
      })),
    },
    places,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const headers = cors(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      const url = new URL(request.url);
      let response: Response;
      if (url.pathname === "/health") response = json({ ok: true });
      else if (["/api/ai/chat", "/api/ai/reputation"].includes(url.pathname) && request.method === "POST") {
        const origin = request.headers.get("origin");
        if (
          origin &&
          !env.ALLOWED_ORIGINS.split(",")
            .map((item) => item.trim())
            .includes(origin)
        ) {
          response = json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
        } else {
          response =
            (await enforceRateLimit(request, env.AI_RATE_LIMITER)) ??
            (url.pathname === "/api/ai/reputation"
              ? await handlePlaceReputation(request, env)
              : await handleAiChat(request, env, {
                  search: (params) => search(new Request(`${url.origin}/api/places/search?${params}`), env),
                  route: ({ scope, ...body }) =>
                    directions(
                      new Request(`${url.origin}/api/routes`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ ...body, cacheScope: scope }),
                      }),
                      env,
                      ctx,
                    ),
                }));
        }
      } else if (url.pathname === "/api/routes" && request.method === "POST")
        response = (await enforceRateLimit(request, env.ROUTE_RATE_LIMITER)) ?? (await directions(request, env, ctx));
      else if (url.pathname === "/api/google/route-search" && request.method === "POST")
        response = (await enforceRateLimit(request, env.ROUTE_RATE_LIMITER)) ?? (await googleRouteSearch(request, env));
      else if (url.pathname === "/api/places/search" && request.method === "GET")
        response = (await enforceRateLimit(request, env.SEARCH_RATE_LIMITER)) ?? (await search(request, env));
      else if (url.pathname === "/api/state" || url.pathname === "/api/schedule/commands") {
        const origin = request.headers.get("origin");
        if (
          origin &&
          !env.ALLOWED_ORIGINS.split(",")
            .map((item) => item.trim())
            .includes(origin)
        ) {
          return json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
        }
        const deviceId = validDevice(request.headers.get("x-gildam-device"));
        const limiter =
          request.method === "GET"
            ? env.STATE_READ_RATE_LIMITER
            : request.method === "PUT" || request.method === "POST"
              ? env.STATE_WRITE_RATE_LIMITER
              : null;
        const blocked = limiter ? await enforceRateLimit(request, limiter) : null;
        response =
          blocked ??
          (!deviceId
            ? json({ error: "기기 식별자가 필요합니다." }, { status: 400 })
            : await handleScheduleApi(request, env.DB, DEFAULT_USER_ID, deviceId));
      } else response = json({ error: "찾을 수 없습니다." }, { status: 404 });
      const next = new Headers(response.headers);
      for (const [k, v] of Object.entries(headers)) next.set(k, v);
      next.set("access-control-expose-headers", "x-gildam-route-cache");
      return new Response(response.body, { status: response.status, headers: next });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "서버 오류가 발생했습니다." }),
        { status: 500, headers: { "content-type": "application/json", ...headers } },
      );
    }
  },
};
