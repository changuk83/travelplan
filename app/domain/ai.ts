import type { Place, TripPlan } from "./types";
import type { ScheduleAction } from "./schedule";

export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiRecommendation = {
  place: Place;
  reason: string;
  dayId: string;
  insertIndex: number;
  scheduledTime?: string;
  distanceMeters?: number;
  distanceLabel?: string;
};

export type AiChatRequest = {
  message: string;
  trip: TripPlan;
  activeDayId: string;
  history: AiMessage[];
  trips?: TripPlan[];
  availablePlaces?: Place[];
  savedPlaces?: Place[];
};

export type AiChatResponse = {
  message: string;
  recommendations: AiRecommendation[];
  actions?: ScheduleAction[];
};
