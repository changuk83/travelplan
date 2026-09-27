import type { DayPlan, Place, SavedCategory } from "./types";

export const DEFAULT_SAVED_CATEGORIES: SavedCategory[] = ["맛집", "카페", "숙소", "관광", "휴게소", "기타"];

export function pointDistance(
  from: { longitude: number; latitude: number },
  to: { longitude: number; latitude: number },
) {
  const radius = 6371;
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const value =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitude / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function distanceLabel(kilometers: number) {
  return kilometers < 1
    ? `${Math.max(1, Math.round(kilometers * 1000))}m`
    : kilometers < 10
      ? `${kilometers.toFixed(1)}km`
      : `${Math.round(kilometers)}km`;
}

export function inferSavedCategory(place: Place): SavedCategory {
  const value = `${place.name} ${place.category}`.toLowerCase();
  if (/휴게소/.test(value)) return "휴게소";
  if (/카페|커피|coffee|베이커리|디저트/.test(value)) return "카페";
  if (/호텔|모텔|펜션|리조트|숙박|게스트하우스|캠핑/.test(value)) return "숙소";
  if (/음식|식당|한식|중식|일식|분식|레스토랑|맛집|치킨|피자/.test(value)) return "맛집";
  if (/관광|공원|박물관|미술관|해수욕장|전망대|테마파크|명소/.test(value)) return "관광";
  return "기타";
}

export function placeCategories(place: Place): SavedCategory[] {
  return place.savedCategories?.length
    ? [...new Set(place.savedCategories)]
    : [place.savedCategory ?? inferSavedCategory(place)];
}

export function addPlaceCategory(place: Place, category: SavedCategory): Place {
  return { ...place, savedCategories: [...new Set([...placeCategories(place), category])], savedCategory: undefined };
}

export function validScheduleTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function withScheduleTime(day: DayPlan, key: string, value: string): DayPlan {
  if (value && !validScheduleTime(value)) return day;
  const scheduleTimes = { ...day.scheduleTimes };
  if (value) scheduleTimes[key] = value;
  else delete scheduleTimes[key];
  return { ...day, scheduleTimes };
}

export function transferScheduleTime(day: DayPlan, fromId: string, toId?: string): DayPlan {
  if (!day.scheduleTimes) return day;
  const time = day.scheduleTimes[`place:${fromId}`];
  const next = withScheduleTime(day, `place:${fromId}`, "");
  return toId && time ? withScheduleTime(next, `place:${toId}`, time) : next;
}
