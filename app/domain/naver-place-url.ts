import type { RouteEndpoint } from "./types";

type MapPlace = RouteEndpoint & { address?: string; link?: string };

export function naverPlaceUrl(place: MapPlace) {
  if (place.link) {
    try {
      const url = new URL(place.link);
      if (url.protocol === "https:" || url.protocol === "http:") {
        const match =
          url.hostname === "map.naver.com"
            ? url.pathname.match(/^\/(?:p|v5)\/(?:entry\/place|search\/[^/]+\/place)\/(\d+)(?:\/|$)/)
            : ["m.place.naver.com", "pcmap.place.naver.com"].includes(url.hostname)
              ? url.pathname.match(/^\/[^/]+\/(\d+)(?:\/|$)/)
              : null;
        if (match) return `https://map.naver.com/p/entry/place/${match[1]}`;
      }
    } catch {
      // Legacy saved places can have invalid provider links.
    }
  }
  // Building names, floors and unit numbers can make a valid business unsearchable.
  // Keep the regional disambiguation, but never treat a Kakao ID as a Naver ID.
  const name = place.name.trim();
  const region = (place.address ?? "").trim().split(/\s+/).slice(0, 2).join(" ");
  const query = region && !name.includes(region) ? `${region} ${name}` : name;
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}
