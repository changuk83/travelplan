"use client";

import { useState } from "react";
import type { RouteEndpoint } from "../../domain/types";
import { naverMobilePlatform, naverPlaceAppUrl, naverPlaceUrl } from "../../domain/naver-place-url";

type MapPlace = RouteEndpoint & { address?: string; link?: string };

export default function PlaceNameLink({ place }: { place: MapPlace }) {
  const [showWebFallback, setShowWebFallback] = useState(false);
  if (!place.name.trim() || ["출발지 미정", "목적지 미정"].includes(place.name)) return <>{place.name}</>;
  return (
    <>
      <a
        className="place-name-link"
        href={naverPlaceUrl(place)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${place.name} 네이버 지도에서 보기`}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const platform = naverMobilePlatform(navigator.userAgent, navigator.maxTouchPoints);
          if (!platform) return;
          event.preventDefault();
          event.stopPropagation();
          setShowWebFallback(true);
          window.location.assign(naverPlaceAppUrl(place, platform, window.location.origin + window.location.pathname));
        }}
      >
        {place.name}
      </a>
      {showWebFallback && (
        <span className="naver-web-fallback">
          앱이 열리지 않나요?{" "}
          <a
            href={naverPlaceUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            aria-label={`${place.name} 웹 지도로 보기 (새 탭)`}
          >
            웹으로 보기 ↗
          </a>
        </span>
      )}
    </>
  );
}
