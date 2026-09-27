import type { ScheduleAction, ScheduleCommand } from "../app/domain/schedule";
import { applyScheduleCommand, scheduleCandidates } from "../app/domain/schedule-service";
import type { Place, TripPlan } from "../app/domain/types";

const text = { type: "string" };
const position = { type: "integer", minimum: 0, maximum: 30 };
const target = { tripId: text, dayId: text };

/** Transport-independent metadata: future MCP adapters can reuse this registry. */
export const scheduleTools = [
  {
    name: "list_trips",
    description: "현재 제공된 여행 목록과 실제 여행 ID, 일차 ID를 조회한다.",
    properties: {},
    readOnly: true,
  },
  {
    name: "get_day_schedule",
    description: "여행의 특정 일차 출발지, 경유지 순서와 ID, 후보지, 목적지를 조회한다. 변경 전에 대상을 확인한다.",
    properties: target,
    readOnly: true,
  },
  {
    name: "add_schedule_place",
    description:
      "검색/이전 추천/저장 목록에서 확인한 placeId를 일정에 추가하는 확인 카드를 준비한다. 저장은 사용자 확인 후 실행된다. insertIndex는 0부터.",
    properties: { ...target, placeId: text, insertIndex: position },
    readOnly: false,
  },
  {
    name: "remove_schedule_place",
    description:
      "일정의 경유지 삭제 확인 카드를 준비한다. 후보가 있으면 첫 후보를 메인으로 승격한다. 내 장소 저장은 삭제하지 않는다.",
    properties: { ...target, placeId: text },
    readOnly: false,
    destructive: true,
  },
  {
    name: "move_schedule_place",
    description:
      "경유지 순서 또는 일차 변경 확인 카드를 준비한다. insertIndex는 원래 장소를 제거한 대상 날짜 목록의 0부터 시작하는 위치다.",
    properties: { ...target, placeId: text, toDayId: text, insertIndex: position },
    readOnly: false,
  },
  {
    name: "add_place_candidate",
    description: "확인된 candidateId 장소를 기존 경유지 placeId의 후보로 등록하는 확인 카드를 준비한다.",
    properties: { ...target, placeId: text, candidateId: text },
    readOnly: false,
  },
].map(({ properties, readOnly, destructive, ...definition }) => ({
  ...definition,
  inputSchema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
  annotations: { readOnlyHint: readOnly, destructiveHint: !!destructive, openWorldHint: false },
}));

export function createScheduleTools(trips: TripPlan[], places: Map<string, Place>) {
  const actions: ScheduleAction[] = [];
  function execute(name: string, args: Record<string, unknown>): unknown {
    if (name === "list_trips")
      return {
        trips: trips.map((trip) => ({
          id: trip.id,
          title: trip.title,
          days: trip.days.map((day, index) => ({ id: day.id, dayNumber: index + 1, date: day.date })),
        })),
      };
    const trip = trips.find((item) => item.id === args.tripId);
    const day = trip?.days.find((item) => item.id === args.dayId);
    if (!trip || !day) return { error: "여행과 날짜 ID를 조회한 뒤 다시 지정하세요." };
    if (name === "get_day_schedule")
      return {
        tripId: trip.id,
        title: trip.title,
        dayId: day.id,
        dayNumber: trip.days.indexOf(day) + 1,
        date: day.date,
        start: day.start,
        goal: day.goal,
        places: day.places.map((place, index) => ({ ...place, index, candidates: scheduleCandidates(day, place.id) })),
      };
    if (actions.length)
      return { error: "한 번에 한 가지 변경만 준비할 수 있습니다. 먼저 표시한 변경을 확인해 주세요." };
    const base = { tripId: trip.id, dayId: day.id };
    const existing = day.places.find((place) => place.id === args.placeId);
    const dayLabel = `${trip.title} · ${trip.days.indexOf(day) + 1}일차`;
    let command: ScheduleCommand;
    let label: string;
    if (name === "add_schedule_place") {
      const place = typeof args.placeId === "string" ? places.get(args.placeId) : undefined;
      if (!place) return { error: "확인되지 않은 장소입니다. 먼저 검색하거나 제공된 장소 ID를 사용하세요." };
      command = { ...base, kind: "add_place", place, insertIndex: args.insertIndex as number };
      label = `${dayLabel} · ${Number(args.insertIndex) + 1}번째 경유지에 ${place.name} 추가`;
    } else if (name === "remove_schedule_place" && existing) {
      command = { ...base, kind: "remove_place", placeId: existing.id };
      const candidate = scheduleCandidates(day, existing.id)[0];
      label = `${dayLabel} · ${existing.name} 삭제${candidate ? ` 후 첫 후보 ${candidate.name}를 메인으로 변경` : ""}`;
    } else if (name === "move_schedule_place" && existing && typeof args.toDayId === "string") {
      command = {
        ...base,
        kind: "move_place",
        placeId: existing.id,
        toDayId: args.toDayId,
        insertIndex: args.insertIndex as number,
      };
      label = `${dayLabel} · ${existing.name} → ${trip.days.findIndex((item) => item.id === args.toDayId) + 1}일차 ${Number(args.insertIndex) + 1}번째 경유지로 이동`;
    } else if (name === "add_place_candidate" && existing) {
      const candidate = typeof args.candidateId === "string" ? places.get(args.candidateId) : undefined;
      if (!candidate) return { error: "확인되지 않은 후보지입니다. 먼저 검색해 주세요." };
      command = { ...base, kind: "add_candidate", placeId: existing.id, candidate };
      label = `${dayLabel} · ${existing.name}의 후보로 ${candidate.name} 추가`;
    } else return { error: "변경할 경유지를 찾을 수 없습니다. 현재 일정을 먼저 조회해 주세요." };
    const checked = applyScheduleCommand({ trips, savedPlaces: [], savedCategories: [] }, command, trip.updatedAt);
    if (checked.error) return { error: checked.error };
    const action = { id: crypto.randomUUID(), label, command, expectedTripUpdatedAt: trip.updatedAt };
    actions.push(action);
    return {
      status: "awaiting_user_confirmation",
      actionId: action.id,
      label,
      note: "아직 일정에 반영되지 않았습니다. 화면의 확인 버튼을 눌러야 실행됩니다.",
    };
  }
  return { actions, execute };
}
