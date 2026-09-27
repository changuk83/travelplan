import type { DayPlan, TripPlan } from "../../domain/types";

export default function TripHeader({
  trip,
  days,
  activeDay,
  syncLabel = "자동 저장",
}: {
  trip: TripPlan;
  days: DayPlan[];
  activeDay: DayPlan;
  syncLabel?: string;
}) {
  return (
    <div className="trip-hero">
      <div className="hero-top">
        <span>
          {days[0]?.date}–{days[days.length - 1]?.date} · {days.length}일 여행
        </span>
        <span className="weather">맑음 27°</span>
      </div>
      <h2>{trip.title}</h2>
      <div className="hero-stats">
        <span>{activeDay.label}</span>
        <span>경유지 {activeDay.places.length}곳</span>
        <span>{syncLabel}</span>
      </div>
    </div>
  );
}
