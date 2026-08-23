"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: { maps: any };
  }
}

type Point = { latitude: number; longitude: number };
type GooglePlace = {
  id: string;
  name: string;
  address: string;
  category: string;
  location: Point;
  detourDistanceMeters?: number;
  detourDurationSeconds?: number;
};
type SearchResult = {
  encodedPolyline: string;
  route: { distanceMeters: number; durationSeconds: number };
  places: GooglePlace[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const GOOGLE_BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const samples = {
  california: {
    label: "샌프란시스코 → 몬터레이",
    start: { latitude: 37.7749, longitude: -122.4194 },
    goal: { latitude: 36.6002, longitude: -121.8947 },
  },
  japan: {
    label: "도쿄 → 하코네",
    start: { latitude: 35.6812, longitude: 139.7671 },
    goal: { latitude: 35.2324, longitude: 139.1069 },
  },
};

function duration(value: number) {
  const minutes = Math.round(value / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`;
}

function distance(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}km` : `${Math.round(value)}m`;
}

function decodePolyline(encoded: string): Point[] {
  const points: Point[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    for (const axis of ["latitude", "longitude"] as const) {
      let result = 0;
      let shift = 0;
      let byte = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "latitude") latitude += delta;
      else longitude += delta;
    }
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}

export default function GoogleMapTest() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const [sample, setSample] = useState<keyof typeof samples>("california");
  const [query, setQuery] = useState("cafe");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!GOOGLE_BROWSER_KEY || !mapNode.current) return;
    const draw = () => {
      if (!window.google || !mapNode.current) return;
      const route = samples[sample];
      const map = mapInstance.current ?? new window.google.maps.Map(mapNode.current, {
        center: route.start,
        zoom: 8,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      mapInstance.current = map;
      overlays.current.forEach((overlay) => overlay.setMap(null));
      overlays.current = [];
      const bounds = new window.google.maps.LatLngBounds();
      const path = result?.encodedPolyline ? decodePolyline(result.encodedPolyline) : [route.start, route.goal];
      path.forEach((point) => bounds.extend(point));
      const line = new window.google.maps.Polyline({ map, path, strokeColor: "#18aa68", strokeWeight: 6, strokeOpacity: 0.95 });
      overlays.current.push(line);
      [
        { ...route.start, label: "S", title: "출발" },
        ...(result?.places ?? []).map((place, index) => ({ ...place.location, label: String(index + 1), title: place.name })),
        { ...route.goal, label: "G", title: "도착" },
      ].forEach((point) => {
        const marker = new window.google.maps.Marker({ map, position: point, label: point.label, title: point.title });
        overlays.current.push(marker);
        bounds.extend(point);
      });
      map.fitBounds(bounds, 42);
    };
    if (window.google) {
      draw();
      return;
    }
    const existing = document.getElementById("google-maps-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", draw, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_BROWSER_KEY)}&language=ko`;
    script.async = true;
    script.onload = draw;
    script.onerror = () => setError("Google 지도를 불러오지 못했습니다. 브라우저 키의 도메인 제한을 확인해 주세요.");
    document.head.appendChild(script);
  }, [sample, result]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const route = samples[sample];
      const response = await fetch(`${API_BASE}/api/google/route-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), start: route.start, goal: route.goal }),
      });
      const data = await response.json() as SearchResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "Google 장소 검색에 실패했습니다.");
      setResult(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Google 장소 검색에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="google-test-shell">
    <header className="google-test-header">
      <a href="/" aria-label="길담 일정으로 돌아가기">‹</a>
      <div><span>해외 여행 준비</span><h1>Google 지도 테스트</h1></div>
      <i aria-hidden="true">G</i>
    </header>
    <section className="google-test-intro">
      <strong>경로 주변 장소를 미리 찾아보세요</strong>
      <p>해외 여행용 Google 지도·경로·장소 검색을 기존 국내 일정과 분리해 시험하는 화면이에요.</p>
    </section>
    <form className="google-test-form" onSubmit={search}>
      <label><span>샘플 경로</span><select value={sample} onChange={(event) => { setSample(event.target.value as keyof typeof samples); setResult(null); }}><option value="california">샌프란시스코 → 몬터레이</option><option value="japan">도쿄 → 하코네</option></select></label>
      <label><span>경로 주변에서 찾을 장소</span><div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: cafe, restaurant, gas station"/><button disabled={loading}>{loading ? "찾는 중" : "검색"}</button></div></label>
    </form>
    {!GOOGLE_BROWSER_KEY && <div className="google-test-notice"><strong>Google 브라우저 키가 필요해요</strong><p><code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>를 등록하면 이 영역에 실제 Google 지도가 표시됩니다.</p></div>}
    <section className="google-test-map" ref={mapNode}>{!GOOGLE_BROWSER_KEY && <div><span>G</span><p>{samples[sample].label}</p></div>}</section>
    {error && <p className="google-test-error">{error}</p>}
    {result && <section className="google-test-results">
      <div className="google-route-summary"><span>전체 경로</span><strong>{distance(result.route.distanceMeters)} · {duration(result.route.durationSeconds)}</strong></div>
      <div className="google-result-heading"><strong>경로 주변 추천</strong><span>{result.places.length}곳</span></div>
      {result.places.map((place, index) => <article key={place.id}><i>{index + 1}</i><div><strong>{place.name}</strong><p>{place.category} · {place.address}</p><span>경유 시 {distance(place.detourDistanceMeters ?? 0)} · {duration(place.detourDurationSeconds ?? 0)}</span></div></article>)}
    </section>}
    {!result && !error && <section className="google-test-empty"><strong>검색 결과가 여기에 표시됩니다</strong><p>Google 서버 키까지 등록하면 경로 주변 장소와 경유 거리·시간을 확인할 수 있어요.</p></section>}
    <p className="google-attribution">Google Maps 데이터 사용</p>
  </main>;
}
