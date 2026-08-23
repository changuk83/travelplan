export type MapPointLiteral = { lat: number; lng: number };

export type GoogleBounds = {
  extend(point: MapPointLiteral): void;
};

export type GoogleMapInstance = {
  fitBounds(bounds: GoogleBounds, padding: number): void;
};

export type GoogleOverlay = {
  setMap(map: GoogleMapInstance | null): void;
};

type GoogleMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  LatLngBounds: new () => GoogleBounds;
  Polyline: new (options: Record<string, unknown>) => GoogleOverlay;
  Marker: new (options: Record<string, unknown>) => GoogleOverlay;
};

export type NaverPosition = object;

export type NaverBounds = {
  extend(point: NaverPosition): void;
};

export type NaverMapInstance = {
  fitBounds(bounds: NaverBounds, padding: Record<string, number>): void;
};

export type NaverOverlay = {
  setMap(map: NaverMapInstance | null): void;
};

type NaverMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMapInstance;
  LatLng: new (latitude: number, longitude: number) => NaverPosition;
  LatLngBounds: new () => NaverBounds;
  Point: new (x: number, y: number) => NaverPosition;
  Polyline: new (options: Record<string, unknown>) => NaverOverlay;
  Marker: new (options: Record<string, unknown>) => NaverOverlay;
};

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
    naver?: { maps: NaverMapsApi };
  }
}
