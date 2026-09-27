import type { RouteEndpoint } from "../../domain/types";

type MapPlace = RouteEndpoint & { address?: string; link?: string };

function naverPlaceUrl(place: MapPlace) {
  if (place.link) {
    try {
      const url = new URL(place.link);
      const match =
        url.hostname === "map.naver.com"
          ? url.pathname.match(/^\/(?:p|v5)\/entry\/place\/(\d+)(?:\/|$)/)
          : ["m.place.naver.com", "pcmap.place.naver.com"].includes(url.hostname)
            ? url.pathname.match(/^\/[^/]+\/(\d+)(?:\/|$)/)
            : null;
      if (match) return `https://map.naver.com/p/entry/place/${match[1]}`;
    } catch {
      // Older saved places may not contain a usable URL.
    }
  }
  const query = [place.name, place.address].filter(Boolean).join(" ");
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

export default function PlaceNameLink({ place }: { place: MapPlace }) {
  if (!place.name.trim() || ["출발지 미정", "목적지 미정"].includes(place.name)) return <>{place.name}</>;
  return (
    <a
      className="place-name-link"
      href={naverPlaceUrl(place)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${place.name} 네이버 지도에서 보기 (새 탭)`}
    >
      {place.name}
    </a>
  );
}
