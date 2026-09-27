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
  if (command.kind === "update_place_memo") {
    if (typeof command.memo !== "string" || command.memo.length > 4000 || typeof command.previousMemo !== "string")
      return fail("메모는 4,000자 이내로 입력해 주세요.");
    const target = [...day.places, ...Object.values(day.candidates ?? {}).flat(), ...state.savedPlaces].find(
      (place) => place.id === command.placeId,
    );
    if (!target) return fail("메모를 남길 등록된 장소를 찾을 수 없어요. 먼저 일정이나 내 장소에 저장해 주세요.");
    if ((target.memo ?? "") !== command.previousMemo)
      return fail("메모가 변경되었어요. 최신 내용을 확인하고 다시 요청해 주세요.");
    const update = (place: Place) => (place.id === command.placeId ? { ...place, memo: command.memo.trim() } : place);
    return {
      error: null,
      state: {
        ...state,
        trips: state.trips.map((item) =>
          item.id !== trip.id
            ? item
            : {
                ...item,
                updatedAt: Math.max(Date.now(), item.updatedAt + 1),
                days: item.days.map((entry) => ({
                  ...entry,
                  places: entry.places.map(update),
                  candidates: entry.candidates
                    ? Object.fromEntries(Object.entries(entry.candidates).map(([id, list]) => [id, list.map(update)]))
                    : entry.candidates,
                })),
              },
        ),
        savedPlaces: state.savedPlaces.map(update),
      },
    };
  }
  if (command.kind === "create_day_schedule") {
    if (day.places.length || Object.values(day.candidates ?? {}).some((items) => items.length))
      return fail("이미 장소가 있는 날은 한꺼번에 등록할 수 없어요. 비어 있는 날짜를 선택해 주세요.");
    if (!Array.isArray(command.stops) || command.stops.length < 1 || command.stops.length > 30)
      return fail("새 하루 일정은 1~30곳으로 구성해 주세요.");
    let next = state;
    let previousTime = day.scheduleTimes?.start ?? "";
    for (const [index, stop] of command.stops.entries()) {
      if (!stop || typeof stop !== "object") return fail("등록할 장소 정보를 확인해 주세요.");
      if (stop.scheduledTime !== undefined) {
        if (!validScheduleTime(stop.scheduledTime)) return fail("시간은 00:00부터 23:59까지 입력해 주세요.");
        if (
          stop.scheduledTime < previousTime ||
          (day.scheduleTimes?.goal && stop.scheduledTime > day.scheduleTimes.goal)
        )
          return fail("방문 시간을 출발·도착 시간과 방문 순서에 맞게 지정해 주세요.");
        previousTime = stop.scheduledTime;
      }
      const added = applyScheduleCommand(next, {
        kind: "add_place",
        tripId: trip.id,
        dayId: day.id,
        place: stop.place,
        insertIndex: index,
        scheduledTime: stop.scheduledTime,
      });
      if (added.error) return fail(added.error);
      next = added.state;
    }
    // Intermediate states are never published: the caller persists this result in one transaction.
    return { state: next, error: null };
  }
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
