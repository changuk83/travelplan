type Point = { latitude: number; longitude: number };
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
  location?: Point;
  primaryTypeDisplayName?: { text?: string };
};
type GooglePlacesResponse = GoogleError & {
  places?: GooglePlaceResponse[];
  routingSummaries?: Array<{ legs?: GoogleRouteLeg[] }>;
};
type RouteSearchPlace = {
  id: string;
  name: string;
  address: string;
  category: string;
  location?: Point;
  detourDistanceMeters: number;
  detourDurationSeconds: number;
};

const seconds = (value?: string) => Number(value?.replace("s", "") ?? 0);

export async function POST(request: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return Response.json({ error: "Google 서버 API 키가 아직 설정되지 않았습니다." }, { status: 503 });
  const {
    query,
    start,
    goal,
    waypoints = [],
  } = (await request.json()) as { query?: string; start?: Point; goal?: Point; waypoints?: Point[] };
  if (!start || !goal) return Response.json({ error: "출발·도착 좌표가 필요합니다." }, { status: 400 });
  if (waypoints.length > 25)
    return Response.json({ error: "Google 해외 경로의 경유지는 최대 25곳까지 추가할 수 있습니다." }, { status: 400 });
  try {
    const routeResponse = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
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
    if (!routeResponse.ok) throw new Error(routeData.error?.message || "Google 경로를 계산하지 못했습니다.");
    const route = routeData.routes?.[0];
    const encodedPolyline = route?.polyline?.encodedPolyline;
    if (!encodedPolyline) throw new Error("Google 경로 결과가 없습니다.");
    let places: RouteSearchPlace[] = [];
    if (query?.trim()) {
      const placesResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
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
      if (!placesResponse.ok) throw new Error(placesData.error?.message || "Google 장소를 검색하지 못했습니다.");
      places = (placesData.places ?? []).map((place, index) => {
        const legs = placesData.routingSummaries?.[index]?.legs ?? [];
        return {
          id: place.id ?? `google-place-${index}`,
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
            legs.reduce((sum, leg) => sum + seconds(leg.duration), 0) - seconds(route.duration),
          ),
        };
      });
    }
    return Response.json({
      encodedPolyline,
      route: {
        distanceMeters: route.distanceMeters ?? 0,
        durationSeconds: seconds(route.duration),
        legs: (route.legs ?? []).map((leg) => ({
          distanceMeters: leg.distanceMeters ?? 0,
          durationSeconds: seconds(leg.duration),
        })),
      },
      places,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Google 경로 주변 검색에 실패했습니다." },
      { status: 502 },
    );
  }
}
