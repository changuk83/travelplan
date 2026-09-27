"use client";

import { useEffect, useRef, useState } from "react";
import type { Place, RouteEndpoint } from "./domain/types";
import type { NaverMapInstance, NaverOverlay } from "./lib/map-sdk-types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export type RouteLeg = { distance: number; duration: number };
export type RouteCacheScope = { userId: number; tripId: string; dayId: string; mode: "schedule" | "preview" };

export default function NaverMap({
  places,
  start,
  goal,
  onRouteData,
  cacheScope,
  topInset = 0,
}: {
  places: Place[];
  start: RouteEndpoint;
  goal: RouteEndpoint;
  onRouteData?: (legs: RouteLeg[]) => void;
  cacheScope?: RouteCacheScope;
  topInset?: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const overlays = useRef<NaverOverlay[]>([]);
  const mapInstance = useRef<NaverMapInstance | null>(null);
  const fitRoute = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);
  const [path, setPath] = useState<number[][]>([]);
  const key = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const goalPending = goal.name === "목적지 미정";

  useEffect(() => {
    if (goalPending) {
      const frame = requestAnimationFrame(() => {
        setPath([[start.longitude, start.latitude]]);
        onRouteData?.([]);
      });
      return () => cancelAnimationFrame(frame);
    }
    let cancelled = false;
    fetch(`${API_BASE}/api/routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waypoints: places, start, goal, cacheScope }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Route request failed");
        return (await response.json()) as { path?: number[][]; legs?: RouteLeg[] };
      })
      .then((data: { path?: number[][]; legs?: RouteLeg[] }) => {
        if (!cancelled && data.path?.length) {
          setPath(data.path);
          onRouteData?.(data.legs ?? []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [places, start, goal, goalPending, onRouteData, cacheScope]);

  useEffect(() => {
    if (!key || !mapRef.current) return;
    const draw = () => {
      if (!window.naver || !mapRef.current) return;
      const { maps } = window.naver;
      const compact = mapRef.current.clientHeight < 250;
      const map =
        mapInstance.current ??
        new maps.Map(mapRef.current, {
          center: new maps.LatLng(37.86, 127.73),
          zoom: 8,
          zoomControl: false,
          scaleControl: false,
        });
      mapInstance.current = map;
      overlays.current.forEach((item) => item.setMap(null));
      overlays.current = [];

      const routePositions = path.map(([lng, lat]) => new maps.LatLng(lat, lng));
      if (routePositions.length > 1) {
        const line = new maps.Polyline({
          map,
          path: routePositions,
          strokeColor: "#18aa68",
          strokeWeight: 7,
          strokeOpacity: 0.96,
          strokeLineCap: "round",
          strokeLineJoin: "round",
        });
        overlays.current.push(line);
      }

      const points = [
        { ...start, label: "S", kind: "start" },
        ...places.map((place, index) => ({ ...place, label: String(index + 1), kind: "waypoint" })),
        ...(!goalPending ? [{ ...goal, label: "G", kind: "goal" }] : []),
      ];
      const bounds = new maps.LatLngBounds();
      routePositions.forEach((position) => bounds.extend(position));
      points.forEach((point) => {
        const position = new maps.LatLng(point.latitude, point.longitude);
        bounds.extend(position);
        const marker = new maps.Marker({
          map,
          position,
          title: point.name,
          zIndex: point.kind === "waypoint" ? 110 : 120,
          icon: {
            content: `<div class="gildam-map-marker ${point.kind}" aria-label="${point.label}">${point.label}</div>`,
            anchor: new maps.Point(19, 19),
          },
        });
        overlays.current.push(marker);
      });

      fitRoute.current = () =>
        map.fitBounds(
          bounds,
          compact
            ? { top: Math.max(24, topInset), right: 24, bottom: 34, left: 24 }
            : { top: Math.max(70, topInset), right: 42, bottom: 56, left: 42 },
        );
      requestAnimationFrame(() => fitRoute.current?.());
    };

    if (window.naver) {
      draw();
      return;
    }
    const existing = document.getElementById("naver-map-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", draw, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "naver-map-script";
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = draw;
    script.onerror = () => setFailed(true);
    document.head.appendChild(script);
  }, [key, path, places, start, goal, goalPending, topInset]);

  if (!key || failed)
    return (
      <div className="map-canvas">
        <div className="sea">동해</div>
        <div className="road road-a" />
        <div className="road road-b" />
        <div className="route-path" />
        <span className="route-marker marker-start">출발</span>
        <span className="route-marker marker-rest">쉼</span>
        <span className="route-marker marker-goal">도착</span>
      </div>
    );
  return (
    <div className="real-map">
      <div ref={mapRef} className="naver-map" />
      <button
        type="button"
        className="fit-route-button"
        onClick={() => fitRoute.current?.()}
        aria-label="전체 경로 보기"
      >
        전체 경로
      </button>
      <div className="map-legend">
        <span>
          <i className="legend-s">S</i>출발
        </span>
        <span>
          <i>1</i>경유지
        </span>
        <span>
          <i className="legend-g">G</i>도착
        </span>
      </div>
    </div>
  );
}
