"use client";

import { useEffect, useRef, useState } from "react";
import type { Place, RouteEndpoint } from "./domain/types";
import type { NaverMapInstance, NaverOverlay } from "./lib/map-sdk-types";
import {
  currentMapPath,
  mapRouteKey,
  validMapPath,
  type MapRouteSnapshot,
  type MapRouteScope,
} from "./domain/map-route";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export type RouteLeg = { distance: number; duration: number };
export type RouteStatus = "loading" | "ready" | "error" | "pending";
export type RouteCacheScope = MapRouteScope;

export default function NaverMap({
  places,
  start,
  goal,
  onRouteData,
  onRouteStatus,
  cacheScope,
  topInset = 0,
}: {
  places: Place[];
  start: RouteEndpoint;
  goal: RouteEndpoint;
  onRouteData?: (legs: RouteLeg[]) => void;
  onRouteStatus?: (status: RouteStatus) => void;
  cacheScope?: RouteCacheScope;
  topInset?: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const overlays = useRef<NaverOverlay[]>([]);
  const mapInstance = useRef<NaverMapInstance | null>(null);
  const fitRoute = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);
  const [route, setRoute] = useState<MapRouteSnapshot | null>(null);
  const requestKey = mapRouteKey(start, goal, places, cacheScope);
  // Hide obsolete geometry during render, before a replacement request can finish.
  const path = currentMapPath(route, requestKey);
  const key = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const goalPending = goal.name === "목적지 미정";

  useEffect(() => {
    const resetFrame = requestAnimationFrame(() => {
      onRouteData?.([]);
      onRouteStatus?.(goalPending ? "pending" : "loading");
    });
    if (goalPending) {
      return () => cancelAnimationFrame(resetFrame);
    }
    let cancelled = false;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/routes`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: requestKey,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Route request failed");
        return (await response.json()) as { path?: number[][]; legs?: RouteLeg[] };
      })
      .then((data: { path?: number[][]; legs?: RouteLeg[] }) => {
        if (!cancelled) {
          cancelAnimationFrame(resetFrame);
          const nextPath = validMapPath(data.path);
          setRoute({ key: requestKey, path: nextPath });
          onRouteData?.(nextPath.length ? (data.legs ?? []) : []);
          onRouteStatus?.(nextPath.length ? "ready" : "error");
        }
      })
      .catch(() => {
        if (!cancelled) {
          cancelAnimationFrame(resetFrame);
          setRoute({ key: requestKey, path: [] });
          onRouteData?.([]);
          onRouteStatus?.("error");
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
      cancelAnimationFrame(resetFrame);
    };
  }, [requestKey, goalPending, onRouteData, onRouteStatus]);

  useEffect(() => {
    if (!key || !mapRef.current) return;
    let disposed = false;
    let fitFrame = 0;
    const draw = () => {
      if (disposed || !window.naver || !mapRef.current) return;
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
      fitFrame = requestAnimationFrame(() => {
        if (!disposed) fitRoute.current?.();
      });
    };
    const onError = () => {
      if (!disposed) setFailed(true);
    };
    let script: HTMLScriptElement | null = null;
    const cleanup = () => {
      disposed = true;
      cancelAnimationFrame(fitFrame);
      script?.removeEventListener("load", draw);
      script?.removeEventListener("error", onError);
      overlays.current.forEach((item) => item.setMap(null));
      overlays.current = [];
      fitRoute.current = null;
    };
    if (window.naver) {
      draw();
      return cleanup;
    }
    const existing = document.getElementById("naver-map-script") as HTMLScriptElement | null;
    if (existing) {
      script = existing;
      existing.addEventListener("load", draw, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return cleanup;
    }
    script = document.createElement("script");
    script.id = "naver-map-script";
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(key)}`;
    script.async = true;
    script.addEventListener("load", draw, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.head.appendChild(script);
    return cleanup;
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
