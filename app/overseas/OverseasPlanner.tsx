"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { GoogleMapInstance, GoogleOverlay } from "../lib/map-sdk-types";

type Point = { latitude: number; longitude: number };
type Place = Point & { id: string; name: string; address: string; category: string };
type Day = { id: string; label: string; date: string; start: Place; goal: Place; places: Place[] };
type SearchPlace = {
  id: string;
  name: string;
  address: string;
  category: string;
  location: Point;
  detourDistanceMeters?: number;
  detourDurationSeconds?: number;
};
type RouteResult = {
  encodedPolyline: string;
  route: {
    distanceMeters: number;
    durationSeconds: number;
    legs: Array<{ distanceMeters: number; durationSeconds: number }>;
  };
  places: SearchPlace[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const GOOGLE_BROWSER_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();
const STORAGE_KEY = "gildam-overseas-days";
const place = (
  id: string,
  name: string,
  address: string,
  latitude: number,
  longitude: number,
  category = "도시",
): Place => ({ id, name, address, latitude, longitude, category });
const initialDays: Day[] = [
  {
    id: "cal-1",
    label: "1일차",
    date: "5.12 화",
    start: place("sf", "San Francisco", "California, USA", 37.7749, -122.4194),
    goal: place("monterey", "Monterey", "California, USA", 36.6002, -121.8947),
    places: [
      place("half-moon", "Half Moon Bay", "California, USA", 37.4636, -122.4286, "해변"),
      place("santa-cruz", "Santa Cruz", "California, USA", 36.9741, -122.0308, "도시"),
    ],
  },
  {
    id: "cal-2",
    label: "2일차",
    date: "5.13 수",
    start: place("monterey-2", "Monterey", "California, USA", 36.6002, -121.8947),
    goal: place("big-sur", "Big Sur", "California, USA", 36.2704, -121.8081),
    places: [place("carmel", "Carmel-by-the-Sea", "California, USA", 36.5552, -121.9233, "마을")],
  },
  {
    id: "cal-3",
    label: "3일차",
    date: "5.14 목",
    start: place("big-sur-2", "Big Sur", "California, USA", 36.2704, -121.8081),
    goal: place("slo", "San Luis Obispo", "California, USA", 35.2828, -120.6596),
    places: [place("morro-bay", "Morro Bay", "California, USA", 35.3658, -120.8499, "해변")],
  },
];

function duration(value = 0) {
  const minutes = Math.max(1, Math.round(value / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60 ? `${minutes % 60}분` : ""}` : `${minutes}분`;
}
function distance(value = 0) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}km` : `${Math.round(value)}m`;
}
function latLng(point: Point) {
  return { lat: point.latitude, lng: point.longitude };
}
function decodePolyline(encoded: string) {
  const points: Point[] = [];
  let index = 0,
    latitude = 0,
    longitude = 0;
  while (index < encoded.length) {
    for (const axis of ["latitude", "longitude"] as const) {
      let result = 0,
        shift = 0,
        byte = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "latitude") latitude += delta;
      else longitude += delta;
    }
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}
function mapsUrl(place: Place) {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.latitude}%2C${place.longitude}&travelmode=driving&dir_action=navigate`;
}

export default function OverseasPlanner() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<GoogleMapInstance | null>(null);
  const overlays = useRef<GoogleOverlay[]>([]);
  const [days, setDays] = useState<Day[]>(initialDays);
  const [activeDayId, setActiveDayId] = useState(initialDays[0].id);
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("cafe");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchPlace[]>([]);
  const activeDay = days.find((day) => day.id === activeDayId) ?? days[0];

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as Day[];
          if (parsed.length) {
            setDays(parsed);
            setActiveDayId(parsed[0].id);
          }
        }
      } catch {
        // 손상된 로컬 데이터는 기본 일정으로 대체한다.
      }
      setHydrated(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(days));
  }, [days, hydrated]);

  const requestRoute = useCallback(
    async (searchQuery = "") => {
      setError("");
      if (!searchQuery) setRouteLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/google/route-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery || undefined,
            start: { latitude: activeDay.start.latitude, longitude: activeDay.start.longitude },
            goal: { latitude: activeDay.goal.latitude, longitude: activeDay.goal.longitude },
            waypoints: activeDay.places.map(({ latitude, longitude }) => ({ latitude, longitude })),
          }),
        });
        const data = (await response.json()) as RouteResult & { error?: string };
        if (!response.ok) throw new Error(data.error || "Google 경로를 계산하지 못했습니다.");
        setResult(data);
        if (searchQuery) setSearchResults(data.places ?? []);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Google 경로를 계산하지 못했습니다.");
      } finally {
        setRouteLoading(false);
      }
    },
    [activeDay],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => void requestRoute());
    return () => cancelAnimationFrame(frame);
  }, [requestRoute]);

  useEffect(() => {
    if (!GOOGLE_BROWSER_KEY || !mapNode.current) return;
    const draw = () => {
      const google = window.google;
      if (!google || !mapNode.current) return;
      const map =
        mapInstance.current ??
        new google.maps.Map(mapNode.current, {
          center: latLng(activeDay.start),
          zoom: 9,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
        });
      mapInstance.current = map;
      overlays.current.forEach((item) => item.setMap(null));
      overlays.current = [];
      const bounds = new google.maps.LatLngBounds();
      const path = result?.encodedPolyline ? decodePolyline(result.encodedPolyline).map(latLng) : [];
      if (path.length) {
        path.forEach((point) => bounds.extend(point));
        overlays.current.push(
          new google.maps.Polyline({ map, path, strokeColor: "#147a80", strokeWeight: 6, strokeOpacity: 0.95 }),
        );
      }
      const points = [
        { ...activeDay.start, label: "S" },
        ...activeDay.places.map((item, index) => ({ ...item, label: String(index + 1) })),
        { ...activeDay.goal, label: "G" },
      ];
      points.forEach((point) => {
        const position = latLng(point);
        bounds.extend(position);
        overlays.current.push(new google.maps.Marker({ map, position, label: point.label, title: point.name }));
      });
      map.fitBounds(bounds, 44);
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
    script.onerror = () => setError("Google 지도를 불러오지 못했습니다. 키의 웹사이트 제한을 확인해 주세요.");
    document.head.appendChild(script);
  }, [activeDay, result]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchResults([]);
    await requestRoute(query.trim());
    setSearching(false);
  }
  function addPlace(item: SearchPlace) {
    if (activeDay.places.length >= 25) {
      setError("해외 일정에는 경유지를 최대 25곳까지 추가할 수 있습니다.");
      return;
    }
    const next: Place = {
      id: item.id,
      name: item.name,
      address: item.address,
      category: item.category,
      latitude: item.location.latitude,
      longitude: item.location.longitude,
    };
    setDays((items) => items.map((day) => (day.id === activeDay.id ? { ...day, places: [...day.places, next] } : day)));
    setSearchOpen(false);
    setSearchResults([]);
  }
  function removePlace(id: string) {
    setDays((items) =>
      items.map((day) =>
        day.id === activeDay.id ? { ...day, places: day.places.filter((item) => item.id !== id) } : day,
      ),
    );
  }
  function movePlace(index: number, direction: -1 | 1) {
    setDays((items) =>
      items.map((day) => {
        if (day.id !== activeDay.id) return day;
        const to = index + direction;
        if (to < 0 || to >= day.places.length) return day;
        const places = [...day.places];
        const [moved] = places.splice(index, 1);
        places.splice(to, 0, moved);
        return { ...day, places };
      }),
    );
  }

  const stops = [activeDay.start, ...activeDay.places, activeDay.goal];
  return (
    <main className="overseas-shell">
      <header className="overseas-header">
        <Link href="/" aria-label="국내 일정으로 돌아가기">
          ‹
        </Link>
        <div>
          <span>OVERSEAS TRIP</span>
          <h1>해외 일정</h1>
        </div>
        <Link className="test-link" href="/google-test" aria-label="Google API 테스트">
          G
        </Link>
      </header>
      <section className="overseas-trip-card">
        <div>
          <span className="overseas-country">🇺🇸 미국 · 캘리포니아</span>
          <span>5월 12일–14일</span>
        </div>
        <h2>캘리포니아 해안 드라이브</h2>
        <p>3일 여행 · 장소 {days.reduce((sum, day) => sum + day.places.length, 0)}곳</p>
      </section>
      <nav className="overseas-days" aria-label="여행 날짜">
        {days.map((day) => (
          <button
            key={day.id}
            className={day.id === activeDay.id ? "active" : ""}
            onClick={() => {
              setActiveDayId(day.id);
              setSearchResults([]);
              setSearchOpen(false);
            }}
          >
            <strong>{day.label}</strong>
            <span>{day.date}</span>
          </button>
        ))}
        <button className="add" aria-label="날짜 추가">
          ＋
        </button>
      </nav>
      <section className="overseas-map-card">
        <div className="overseas-map-heading">
          <div>
            <span>{routeLoading ? "경로 계산 중…" : "오늘의 이동 경로"}</span>
            <strong>
              {activeDay.start.name} → {activeDay.goal.name}
            </strong>
          </div>
          <button type="button" aria-label="지도 고정">
            ⌖
          </button>
        </div>
        <div ref={mapNode} className="overseas-map">
          {!GOOGLE_BROWSER_KEY && <p>Google 지도 키를 확인해 주세요.</p>}
        </div>
        {result && !routeLoading && (
          <div className="overseas-route-summary">
            <span>전체 자동차 경로</span>
            <strong>
              {distance(result.route.distanceMeters)} · {duration(result.route.durationSeconds)}
            </strong>
          </div>
        )}
      </section>
      {error && <p className="overseas-error">{error}</p>}
      {searchOpen && (
        <section className="overseas-search-panel">
          <header>
            <div>
              <span>경로 주변 장소</span>
              <strong>
                {activeDay.start.name} → {activeDay.goal.name}
              </strong>
            </div>
            <button
              onClick={() => {
                setSearchOpen(false);
                setSearchResults([]);
              }}
              aria-label="검색 닫기"
            >
              ×
            </button>
          </header>
          <form onSubmit={search}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="cafe, restaurant, gas station"
            />
            <button disabled={searching}>{searching ? "찾는 중" : "검색"}</button>
          </form>
          <p>현재 경로에서 우회가 적은 장소를 Google 지도에서 찾아요.</p>
          {searchResults.length > 0 && (
            <div className="overseas-search-results">
              {searchResults.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.category} · {item.address}
                    </p>
                    <span>
                      경유 시 +{distance(item.detourDistanceMeters)} · +{duration(item.detourDurationSeconds)}
                    </span>
                  </div>
                  <button onClick={() => addPlace(item)}>일정 추가</button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="overseas-schedule">
        <header>
          <div>
            <span>{activeDay.label} 일정</span>
            <h2>해안도로를 따라 천천히</h2>
          </div>
          <button type="button" onClick={() => setSearchOpen(true)}>
            ＋ 장소 추가
          </button>
        </header>
        {stops.map((stop, index) => (
          <div className="overseas-stop-wrap" key={`${stop.id}-${index}`}>
            {index > 0 && (
              <div className="overseas-leg">
                <span>자동차</span>
                <strong>
                  {result?.route.legs[index - 1]
                    ? `${distance(result.route.legs[index - 1].distanceMeters)} · ${duration(result.route.legs[index - 1].durationSeconds)}`
                    : "경로 계산 중…"}
                </strong>
              </div>
            )}
            <article>
              <i className={index === 0 ? "start" : index === stops.length - 1 ? "goal" : ""}>
                {index === 0 ? "S" : index === stops.length - 1 ? "G" : index}
              </i>
              <div>
                <span>{index === 0 ? "출발" : index === stops.length - 1 ? "도착" : "경유지"}</span>
                <strong>{stop.name}</strong>
                <p>
                  {stop.category} · {stop.address}
                </p>
              </div>
              <div className="overseas-stop-actions">
                <a href={mapsUrl(stop)} aria-label={`Google 지도로 ${stop.name} 길찾기`}>
                  G
                </a>
                {index > 0 && index < stops.length - 1 && (
                  <>
                    <button onClick={() => movePlace(index - 1, -1)} disabled={index === 1} aria-label="앞으로 이동">
                      ↑
                    </button>
                    <button
                      onClick={() => movePlace(index - 1, 1)}
                      disabled={index === stops.length - 2}
                      aria-label="뒤로 이동"
                    >
                      ↓
                    </button>
                    <button className="remove" onClick={() => removePlace(stop.id)} aria-label={`${stop.name} 삭제`}>
                      ×
                    </button>
                  </>
                )}
              </div>
            </article>
          </div>
        ))}
      </section>
      <p className="overseas-attribution">Google Maps 데이터 사용</p>
      <nav className="overseas-bottom-nav">
        <Link className="active" href="/overseas">
          <span>⌁</span>일정
        </Link>
        <Link href="/overseas">
          <span>✈</span>해외 여행
        </Link>
        <Link href="/">
          <span>⌂</span>국내 여행
        </Link>
      </nav>
    </main>
  );
}
