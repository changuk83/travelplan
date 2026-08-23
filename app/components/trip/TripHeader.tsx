import type { DayPlan, TripPlan } from "../../domain/types";

export default function TripHeader({ trip, days, activeDay }: { trip: TripPlan; days: DayPlan[]; activeDay: DayPlan }) {
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
        <span>자동 저장</span>
      </div>
    </div>
  );
}
