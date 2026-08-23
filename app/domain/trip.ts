import { comparableDate, isoDate } from "./date";
import type { DayPlan, TripPlan } from "./types";

export const initialDays: DayPlan[] = [
  {
    id: "day-1",
    label: "1일차",
    date: "날짜 미정",
    start: { name: "출발지 미정", longitude: 127.5, latitude: 36.5 },
    goal: { name: "목적지 미정", longitude: 127.5, latitude: 36.5 },
    places: [],
  },
];

export const initialTrips: TripPlan[] = [
  { id: "trip-new", title: "새 여행", days: initialDays, updatedAt: Date.now() },
];

export function initialTrip(trips: TripPlan[]) {
  const today = isoDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const dated = trips.map((trip) => ({
    trip,
    start: comparableDate(trip.days[0]),
    end: comparableDate(trip.days.at(-1)),
  }));
  const current = dated
    .filter((item) => item.start && item.end && item.start <= today && item.end >= today)
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))[0];
  if (current) return current.trip;
  const upcoming = dated
    .filter((item) => item.start && item.start > today)
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))[0];
  if (upcoming) return upcoming.trip;
  return [...trips].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? trips[0];
}

export function tripStatusLabel(trip: TripPlan, activeTripId: string) {
  const today = isoDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const start = comparableDate(trip.days[0]);
  if (start && start > today) return "예정";
  return trip.id === activeTripId ? "진행 중" : "저장됨";
}
