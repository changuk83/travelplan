import type { DayPlan, TripPlan } from "../../domain/types";
import { compactDateLabel } from "../../domain/date";

export default function TripHeader({
  trip,
  days,
  syncLabel = "자동 저장",
}: {
  trip: TripPlan;
  days: DayPlan[];
  activeDay: DayPlan;
  syncLabel?: string;
}) {
  return (
    <div className="trip-hero">
      <h2>{trip.title}</h2>
      <div className="hero-top">
        <span>
          {compactDateLabel(days[0]?.date ?? "")} – {compactDateLabel(days[days.length - 1]?.date ?? "")} ·{" "}
          {days.length}일
        </span>
      </div>
      {syncLabel !== "자동 저장" && syncLabel !== "기기에 자동 저장" && (
        <div className="hero-sync-status" role="status">
          {syncLabel}
        </div>
      )}
    </div>
  );
}
