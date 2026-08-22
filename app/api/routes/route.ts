export async function POST(request: Request) {
  const { waypoints = [], start, goal } = await request.json() as { waypoints?: Array<{ longitude: number; latitude: number }>; start?: { longitude: number; latitude: number }; goal?: { longitude: number; latitude: number } };
  const id = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (!id || !secret) return Response.json({ error: "지도 API 키가 설정되지 않았습니다." }, { status: 500 });
  const url = new URL("https://maps.apigw.ntruss.com/map-direction/v1/driving");
  url.searchParams.set("start", `${start?.longitude ?? 127.095},${start?.latitude ?? 37.322}`); url.searchParams.set("goal", `${goal?.longitude ?? 128.467},${goal?.latitude ?? 38.378}`); url.searchParams.set("option", "traoptimal");
  if (waypoints.length) url.searchParams.set("waypoints", waypoints.slice(0, 5).map((point) => `${point.longitude},${point.latitude}`).join("|"));
  const response = await fetch(url, { headers: { "x-ncp-apigw-api-key-id": id, "x-ncp-apigw-api-key": secret, Accept: "application/json" } });
  const data = await response.json() as { route?: { traoptimal?: Array<{ path?: number[][]; summary?: { distance?: number; duration?: number }; guide?: Array<{ type?: number; distance?: number; duration?: number }> }> }; message?: string };
  if (!response.ok) return Response.json({ error: data.message || "경로를 계산하지 못했습니다." }, { status: response.status });
  const route = data.route?.traoptimal?.[0];
  const legs: Array<{ distance: number; duration: number }> = [];
  let distance = 0;
  let duration = 0;
  for (const guide of route?.guide ?? []) {
    distance += guide.distance ?? 0;
    duration += guide.duration ?? 0;
    if (guide.type === 87 || guide.type === 88) {
      legs.push({ distance, duration });
      distance = 0;
      duration = 0;
    }
  }
  return Response.json({ path: route?.path ?? [], summary: route?.summary ?? null, legs });
}
