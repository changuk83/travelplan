import type { AiRecommendation } from "./ai";
import { applyScheduleCommand } from "./schedule-service";
import type { TripPlan } from "./types";

/** Compatibility adapter; all insertion rules live in the shared schedule service. */
export function insertAiRecommendation(
  trip: TripPlan,
  recommendation: AiRecommendation,
): { trip: TripPlan; error: string | null } {
  const result = applyScheduleCommand(
    { trips: [trip], savedPlaces: [], savedCategories: [] },
    {
      kind: "add_place",
      tripId: trip.id,
      dayId: recommendation.dayId,
      place: recommendation.place,
      insertIndex: recommendation.insertIndex,
    },
  );
  return { trip: result.state.trips[0], error: result.error };
}
