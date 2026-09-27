import type { Place, TripPlan } from "./types";

export type ScheduleState = { trips: TripPlan[]; savedPlaces: Place[]; savedCategories: string[] };
export type VersionedState = ScheduleState & { revision: number };
export type ScheduleCommand =
  | { kind: "add_place"; tripId: string; dayId: string; place: Place; insertIndex: number; scheduledTime?: string }
  | { kind: "remove_place"; tripId: string; dayId: string; placeId: string }
  | { kind: "move_place"; tripId: string; dayId: string; placeId: string; toDayId: string; insertIndex: number }
  | { kind: "add_candidate"; tripId: string; dayId: string; placeId: string; candidate: Place };

export type ScheduleAction = {
  id: string;
  label: string;
  command: ScheduleCommand;
  expectedTripUpdatedAt: number;
};

export type ScheduleCommandRequest = {
  requestId: string;
  expectedRevision: number;
  expectedTripUpdatedAt: number;
  command: ScheduleCommand;
};
