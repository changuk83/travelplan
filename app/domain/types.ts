export type SavedCategory = string;

export type Place = {
  id: string;
  name: string;
  category: string;
  address: string;
  longitude: number;
  latitude: number;
  link?: string;
  memo?: string;
  savedCategory?: SavedCategory;
  savedCategories?: SavedCategory[];
};

export type RouteEndpoint = {
  name: string;
  longitude: number;
  latitude: number;
};

export type DayPlan = {
  id: string;
  label: string;
  date: string;
  dateValue?: string;
  start: RouteEndpoint;
  goal: RouteEndpoint;
  places: Place[];
  candidates?: Record<string, Place[]>;
};

export type TripPlan = {
  id: string;
  title: string;
  days: DayPlan[];
  updatedAt: number;
};

export type TextEditor = {
  kind: "trip" | "memo" | "category-add" | "category-rename";
  title: string;
  value: string;
  tripId?: string;
  place?: Place;
  category?: string;
};

export type TripCreator = {
  title: string;
  startDate: string;
  endDate: string;
  error: string;
};

export type AppTab = "plan" | "map" | "trips" | "saved";
export type SearchSource = "kakao" | "mixed" | "local" | "geocoding" | "";
