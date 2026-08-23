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
    const fromLng = params.get("fromLng"), fromLat = params.get("fromLat"), toLng = params.get("toLng"), toLat = params.get("toLat");
    const from = { longitude: Number(fromLng), latitude: Number(fromLat) }, to = { longitude: Number(toLng), latitude: Number(toLat) };
    const hasFrom = fromLng !== null && fromLat !== null && Number.isFinite(from.longitude) && Number.isFinite(from.latitude), hasTo = toLng !== null && toLat !== null && Number.isFinite(to.longitude) && Number.isFinite(to.latitude);
    if (kakaoKey && hasFrom) {
      const kakaoUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
      kakaoUrl.searchParams.set("query", query); kakaoUrl.searchParams.set("x", String(from.longitude)); kakaoUrl.searchParams.set("y", String(from.latitude)); kakaoUrl.searchParams.set("radius", "20000"); kakaoUrl.searchParams.set("size", "15"); kakaoUrl.searchParams.set("sort", "distance");
      const kakaoResponse = await fetch(kakaoUrl, { headers: { Authorization: `KakaoAK ${kakaoKey}` } }).catch(() => null);
      if (kakaoResponse?.ok) {
        const kakaoData = await kakaoResponse.json() as { documents?: Array<{ id: string; place_name: string; category_name?: string; category_group_name?: string; road_address_name?: string; address_name?: string; x: string; y: string; place_url?: string }> };
        const places = (kakaoData.documents ?? []).map((item) => ({ id: `kakao-${item.id}`, name: item.place_name, category: item.category_name || item.category_group_name || "장소", address: item.road_address_name || item.address_name || "", longitude: Number(item.x), latitude: Number(item.y), link: item.place_url || "" }));
        if (hasTo) places.sort((a, b) => (distanceKm(from, a) + distanceKm(a, to)) - (distanceKm(from, b) + distanceKm(b, to)));
        if (places.length) return Response.json({ source: "kakao", places });
      }
    }
    if (hubId && hubSecret) {
      const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
      url.searchParams.set("query", query); url.searchParams.set("display", "5"); url.searchParams.set("format", "json");
      const response = await fetch(url, { headers: { "X-NCP-APIGW-API-KEY-ID": hubId, "X-NCP-APIGW-API-KEY": hubSecret } });
      if (!response.ok) throw new Error(`지역 검색 실패 (${response.status})`);
      const data = await response.json() as { items?: SearchItem[] };
      const places = (data.items ?? []).map((item, index) => ({ id: `local-${index}-${item.mapx}`, name: clean(item.title), category: clean(item.category), address: item.roadAddress || item.address || "", longitude: coordinate(item.mapx), latitude: coordinate(item.mapy), link: item.link || "" }));
      if (places.length) return Response.json({ source: "local", places });
    }

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
