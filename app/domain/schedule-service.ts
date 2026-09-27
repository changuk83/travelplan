import { addPlaceCategory, placeCategories, validScheduleTime, withScheduleTime, transferScheduleTime } from "./place";
import type { ScheduleCommand, ScheduleState } from "./schedule";
import type { DayPlan, Place } from "./types";

export function scheduleCandidates(day: DayPlan, placeId: string): Place[] {
  const candidates = day.candidates;
  return candidates && Object.hasOwn(candidates, placeId) && Array.isArray(candidates[placeId])
    ? candidates[placeId]
    : [];
}

function validPlace(place: Place) {
  return (
    place &&
    typeof place.id === "string" &&
    !!place.id &&
    typeof place.name === "string" &&
    !!place.name &&
    typeof place.category === "string" &&
    typeof place.address === "string" &&
    (place.savedCategory === undefined || typeof place.savedCategory === "string") &&
    (place.savedCategories === undefined ||
      (Array.isArray(place.savedCategories) &&
        place.savedCategories.every((category) => typeof category === "string"))) &&
    Number.isFinite(place.longitude) &&
    Number.isFinite(place.latitude) &&
    Math.abs(place.longitude) <= 180 &&
    Math.abs(place.latitude) <= 90 &&
    (place.longitude !== 0 || place.latitude !== 0)
  );
}

function samePlace(a: Place, b: Place) {
  return (
    a.id === b.id ||
    (a.name === b.name && Math.abs(a.longitude - b.longitude) < 0.0001 && Math.abs(a.latitude - b.latitude) < 0.0001)
  );
}

/** Pure command execution, shared by UI and server. Persistence/authorization belong to the caller. */
export function applyScheduleCommand(
  state: ScheduleState,
  command: ScheduleCommand,
  expectedTripUpdatedAt?: number,
): { state: ScheduleState; error: string | null } {
  const fail = (error: string) => ({ state, error });
  if (!command || typeof command !== "object") return fail("일정 변경 요청을 확인해 주세요.");
  const trip = state.trips.find((item) => item.id === command.tripId);
  if (!trip) return fail("여행을 찾을 수 없어요. 다시 선택해 주세요.");
  if (expectedTripUpdatedAt !== undefined && trip.updatedAt !== expectedTripUpdatedAt)
    return fail("일정이 변경되었어요. 최신 일정을 확인한 뒤 다시 요청해 주세요.");
  const day = trip.days.find((item) => item.id === command.dayId);
  if (!day) return fail("날짜를 찾을 수 없어요. 다시 선택해 주세요.");
  let days = trip.days;
  let saved: Place | undefined;
  if (command.kind === "add_place") {
    if (command.scheduledTime !== undefined && !validScheduleTime(command.scheduledTime))
      return fail("시간은 00:00부터 23:59까지 입력해 주세요.");
    if (!validPlace(command.place)) return fail("장소의 위치를 확인할 수 없어요. 다시 검색해 주세요.");
    if (day.places.length >= 30) return fail("하루 경유지는 최대 30곳까지 추가할 수 있어요.");
    if (day.places.some((place) => samePlace(place, command.place))) return fail("이 날짜에 이미 추가한 장소예요.");
    if (!Number.isInteger(command.insertIndex) || command.insertIndex < 0 || command.insertIndex > day.places.length)
      return fail("추가할 위치를 다시 선택해 주세요.");
    saved = addPlaceCategory(command.place, trip.title);
    const places = [...day.places];
    places.splice(command.insertIndex, 0, saved);
    days = days.map((item) =>
      item.id === day.id
        ? command.scheduledTime
          ? withScheduleTime({ ...item, places }, `place:${command.place.id}`, command.scheduledTime)
          : { ...item, places }
        : item,
    );
  } else if (command.kind === "remove_place") {
    if (!day.places.some((place) => place.id === command.placeId)) return fail("삭제할 장소를 찾을 수 없어요.");
    const [promoted, ...remaining] = scheduleCandidates(day, command.placeId);
    if (promoted && day.places.some((place) => place.id !== command.placeId && samePlace(place, promoted)))
      return fail("첫 번째 후보가 이미 일정에 있어요. 후보를 정리한 뒤 다시 삭제해 주세요.");
    let candidates = { ...day.candidates };
    delete candidates[command.placeId];
    if (promoted && remaining.length) candidates = { ...candidates, [promoted.id]: remaining };
    const places = promoted
      ? day.places.map((place) => (place.id === command.placeId ? promoted : place))
      : day.places.filter((place) => place.id !== command.placeId);
    days = days.map((item) =>
      item.id === day.id ? transferScheduleTime({ ...item, places, candidates }, command.placeId, promoted?.id) : item,
    );
  } else if (command.kind === "move_place") {
    const place = day.places.find((item) => item.id === command.placeId);
    const destination = days.find((item) => item.id === command.toDayId);
    if (!place || !destination) return fail("이동할 장소나 날짜를 찾을 수 없어요.");
    const target = destination.places.filter((item) => day.id !== destination.id || item.id !== place.id);
    if (target.length >= 30) return fail("하루 경유지는 최대 30곳까지 추가할 수 있어요.");
    if (target.some((item) => samePlace(item, place))) return fail("이동할 날짜에 이미 추가한 장소예요.");
    if (!Number.isInteger(command.insertIndex) || command.insertIndex < 0 || command.insertIndex > target.length)
      return fail("이동할 위치를 다시 선택해 주세요.");
    target.splice(command.insertIndex, 0, place);
    if (day.id === destination.id) {
      days = days.map((item) => (item.id === day.id ? { ...item, places: target } : item));
    } else {
      const candidates = { ...day.candidates };
      const movedCandidates = scheduleCandidates(day, place.id);
      delete candidates[place.id];
      days = days.map((item) =>
        item.id === day.id
          ? transferScheduleTime(
              { ...item, places: item.places.filter((entry) => entry.id !== place.id), candidates },
              place.id,
            )
          : item.id === destination.id
            ? {
                ...(day.scheduleTimes?.[`place:${place.id}`]
                  ? withScheduleTime(item, `place:${place.id}`, day.scheduleTimes[`place:${place.id}`])
                  : item),
                places: target,
                candidates: { ...item.candidates, ...(movedCandidates.length ? { [place.id]: movedCandidates } : {}) },
              }
            : item,
      );
    }
  } else if (command.kind === "add_candidate") {
    const main = day.places.find((place) => place.id === command.placeId);
    if (!main) return fail("후보를 추가할 메인 장소를 찾을 수 없어요.");
    if (!validPlace(command.candidate)) return fail("후보 장소의 위치를 확인할 수 없어요.");
    const candidates = scheduleCandidates(day, main.id);
    if (samePlace(main, command.candidate) || candidates.some((place) => samePlace(place, command.candidate)))
      return fail("이미 등록한 장소예요.");
    saved = addPlaceCategory(command.candidate, trip.title);
    const added = saved;
    days = days.map((item) =>
      item.id === day.id ? { ...item, candidates: { ...item.candidates, [main.id]: [...candidates, added] } } : item,
    );
  } else {
    return fail("지원하지 않는 일정 변경 요청이에요.");
  }
  let savedPlaces = state.savedPlaces;
  if (saved) {
    const added = saved;
    const existing = savedPlaces.find((place) => place.id === added.id);
    savedPlaces = existing
      ? savedPlaces.map((place) =>
          place.id === added.id
            ? {
                ...place,
                savedCategories: [...new Set([...placeCategories(place), ...placeCategories(added)])],
                savedCategory: undefined,
              }
            : place,
        )
      : [added, ...savedPlaces];
  }
  return {
    error: null,
    state: {
      ...state,
      trips: state.trips.map((item) =>
        item.id === trip.id ? { ...trip, days, updatedAt: Math.max(Date.now(), trip.updatedAt + 1) } : item,
      ),
      savedPlaces,
      savedCategories: saved ? [...new Set([...state.savedCategories, trip.title])] : state.savedCategories,
    },
  };
}
