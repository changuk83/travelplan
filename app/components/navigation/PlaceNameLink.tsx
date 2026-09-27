import type { RouteEndpoint } from "../../domain/types";
import { naverPlaceUrl } from "../../domain/naver-place-url";

type MapPlace = RouteEndpoint & { address?: string; link?: string };

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
