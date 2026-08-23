type SearchItem = {
  title?: string; category?: string; roadAddress?: string; address?: string;
  mapx?: string; mapy?: string; link?: string;
};

const clean = (value = "") => value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const coordinate = (value?: string) => {
  const number = Number(value);
  return Math.abs(number) > 180 ? number / 10_000_000 : number;
};
const distanceKm = (from: { longitude: number; latitude: number }, to: { longitude: number; latitude: number }) => { const radius = 6371; const radians = (value: number) => value * Math.PI / 180; const latitude = radians(to.latitude - from.latitude); const longitude = radians(to.longitude - from.longitude); const value = Math.sin(latitude / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitude / 2) ** 2; return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)); };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim();
  if (!query || query.length < 2) return Response.json({ error: "두 글자 이상 입력해 주세요." }, { status: 400 });

  const hubId = process.env.NAVER_SEARCH_CLIENT_ID;
  const hubSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  const mapId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const mapSecret = process.env.NAVER_MAP_CLIENT_SECRET;
  const kakaoKey = process.env.KAKAO_REST_API_KEY;

  try {
    const fromLng = params.get("fromLng"), fromLat = params.get("fromLat"), toLng = params.get("toLng"), toLat = params.get("toLat"), mainLng = params.get("mainLng"), mainLat = params.get("mainLat");
    const from = { longitude: Number(fromLng), latitude: Number(fromLat) }, to = { longitude: Number(toLng), latitude: Number(toLat) }, main = { longitude: Number(mainLng), latitude: Number(mainLat) };
    const hasFrom = fromLng !== null && fromLat !== null && Number.isFinite(from.longitude) && Number.isFinite(from.latitude), hasTo = toLng !== null && toLat !== null && Number.isFinite(to.longitude) && Number.isFinite(to.latitude), hasMain = mainLng !== null && mainLat !== null && Number.isFinite(main.longitude) && Number.isFinite(main.latitude);
    const kakaoPlaces: Array<{ id: string; name: string; category: string; address: string; longitude: number; latitude: number; link: string }> = [];
    if (kakaoKey && hasFrom) {
      const centers = [...(hasTo ? [from, to] : [from]), ...(hasMain ? [main] : [])];
      const responses = await Promise.all(centers.map((center) => { const kakaoUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json"); kakaoUrl.searchParams.set("query", query); kakaoUrl.searchParams.set("x", String(center.longitude)); kakaoUrl.searchParams.set("y", String(center.latitude)); kakaoUrl.searchParams.set("radius", "20000"); kakaoUrl.searchParams.set("size", "15"); kakaoUrl.searchParams.set("sort", "distance"); return fetch(kakaoUrl, { headers: { Authorization: `KakaoAK ${kakaoKey}` } }).catch(() => null); }));
      for (const response of responses) { if (!response?.ok) continue; const data = await response.json() as { documents?: Array<{ id: string; place_name: string; category_name?: string; category_group_name?: string; road_address_name?: string; address_name?: string; x: string; y: string; place_url?: string }> }; for (const item of data.documents ?? []) { if (kakaoPlaces.some((place) => place.id === `kakao-${item.id}`)) continue; kakaoPlaces.push({ id: `kakao-${item.id}`, name: item.place_name, category: item.category_name || item.category_group_name || "장소", address: item.road_address_name || item.address_name || "", longitude: Number(item.x), latitude: Number(item.y), link: item.place_url || "" }); } }
      if (hasMain) kakaoPlaces.sort((a, b) => distanceKm(main, a) - distanceKm(main, b)); else if (hasTo) kakaoPlaces.sort((a, b) => (distanceKm(from, a) + distanceKm(a, to)) - (distanceKm(from, b) + distanceKm(b, to))); else kakaoPlaces.sort((a, b) => distanceKm(from, a) - distanceKm(from, b));
      if (kakaoPlaces.length >= 10) return Response.json({ source: "kakao", places: kakaoPlaces.slice(0, 20) });
    }
    if (hubId && hubSecret) {
      const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
      url.searchParams.set("query", query); url.searchParams.set("display", "5"); url.searchParams.set("format", "json");
      const response = await fetch(url, { headers: { "X-NCP-APIGW-API-KEY-ID": hubId, "X-NCP-APIGW-API-KEY": hubSecret } });
      if (!response.ok) throw new Error(`지역 검색 실패 (${response.status})`);
      const data = await response.json() as { items?: SearchItem[] };
      const places = (data.items ?? []).map((item, index) => ({ id: `local-${index}-${item.mapx}`, name: clean(item.title), category: clean(item.category), address: item.roadAddress || item.address || "", longitude: coordinate(item.mapx), latitude: coordinate(item.mapy), link: item.link || "" }));
      if (kakaoPlaces.length) { const combined = [...kakaoPlaces]; for (const place of places) { const duplicate = combined.some((item) => clean(item.name).replace(/\s/g, "") === clean(place.name).replace(/\s/g, "") || (Boolean(item.address) && item.address === place.address)); if (!duplicate) combined.push(place); } if (hasMain) combined.sort((a, b) => distanceKm(main, a) - distanceKm(main, b)); else if (hasTo) combined.sort((a, b) => (distanceKm(from, a) + distanceKm(a, to)) - (distanceKm(from, b) + distanceKm(b, to))); else combined.sort((a, b) => distanceKm(from, a) - distanceKm(from, b)); return Response.json({ source: places.length ? "mixed" : "kakao", places: combined.slice(0, 20) }); }
      if (places.length) return Response.json({ source: "local", places });
    }
    if (kakaoPlaces.length) return Response.json({ source: "kakao", places: kakaoPlaces.slice(0, 20) });

    if (!mapId || !mapSecret) return Response.json({ error: "지도 API 키가 설정되지 않았습니다." }, { status: 500 });
    const url = new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
    url.searchParams.set("query", query); url.searchParams.set("count", "5");
    const response = await fetch(url, { headers: { "x-ncp-apigw-api-key-id": mapId, "x-ncp-apigw-api-key": mapSecret, Accept: "application/json" } });
    if (!response.ok) throw new Error(`주소 검색 실패 (${response.status})`);
    const data = await response.json() as { addresses?: Array<{ roadAddress?: string; jibunAddress?: string; x: string; y: string }> };
    return Response.json({ source: "geocoding", places: (data.addresses ?? []).map((item, index) => ({ id: `address-${index}-${item.x}`, name: item.roadAddress || item.jibunAddress || query, category: "주소", address: item.jibunAddress || item.roadAddress || "", longitude: Number(item.x), latitude: Number(item.y), link: "" })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "검색 중 오류가 발생했습니다." }, { status: 502 });
  }
}
