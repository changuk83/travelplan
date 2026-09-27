import type { RouteEndpoint } from "./types";

type MapPlace = RouteEndpoint & { address?: string; link?: string };

function placeQuery(place: MapPlace) {
  const name = place.name.trim();
  const region = (place.address ?? "").trim().split(/\s+/).slice(0, 2).join(" ");
  return region && !name.includes(region) ? `${region} ${name}` : name;
}

export function naverMobilePlatform(userAgent: string, maxTouchPoints = 0): "ios" | "android" | null {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return "ios";
  return null;
}

export function naverPlaceAppUrl(place: MapPlace, platform: "ios" | "android", pageUrl: string) {
  // Use the documented search action; provider place IDs are not interchangeable.
  const params = `query=${encodeURIComponent(placeQuery(place))}&appname=${encodeURIComponent(pageUrl)}`;
  return platform === "android"
    ? `intent://search?${params}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;S.browser_fallback_url=${encodeURIComponent(naverPlaceUrl(place))};end`
    : `nmap://search?${params}`;
}

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
  const query = placeQuery(place);
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}
