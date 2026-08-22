type SearchItem = {
  title?: string; category?: string; roadAddress?: string; address?: string;
  mapx?: string; mapy?: string; link?: string;
};

const clean = (value = "") => value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const coordinate = (value?: string) => {
  const number = Number(value);
  return Math.abs(number) > 180 ? number / 10_000_000 : number;
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 2) return Response.json({ error: "두 글자 이상 입력해 주세요." }, { status: 400 });

  const hubId = process.env.NAVER_SEARCH_CLIENT_ID;
  const hubSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  const mapId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const mapSecret = process.env.NAVER_MAP_CLIENT_SECRET;

  try {
    if (hubId && hubSecret) {
      const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
      url.searchParams.set("query", query); url.searchParams.set("display", "5"); url.searchParams.set("format", "json");
      const response = await fetch(url, { headers: { "X-NCP-APIGW-API-KEY-ID": hubId, "X-NCP-APIGW-API-KEY": hubSecret } });
      if (!response.ok) throw new Error(`지역 검색 실패 (${response.status})`);
      const data = await response.json() as { items?: SearchItem[] };
      return Response.json({ source: "local", places: (data.items ?? []).map((item, index) => ({ id: `local-${index}-${item.mapx}`, name: clean(item.title), category: clean(item.category), address: item.roadAddress || item.address || "", longitude: coordinate(item.mapx), latitude: coordinate(item.mapy), link: item.link || "" })) });
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
