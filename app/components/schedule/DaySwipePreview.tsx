import type { DayPlan } from "../../domain/types";
import { compactDateLabel } from "../../domain/date";

export default function DaySwipePreview({
  day,
  direction,
  tripTitle,
  tripRange,
}: {
  day: DayPlan;
  direction: "previous" | "next";
  tripTitle: string;
  tripRange: string;
}) {
  const stops = [day.start, ...day.places, day.goal];
  return (
    <div className={`day-swipe-preview ${direction}`} aria-hidden="true">
      <div className="trip-overview">
        <div className="trip-hero">
          <h2>{tripTitle}</h2>
          <div className="hero-top">
            <span>{tripRange.replace(/(\d+)월\s*(\d+)일/g, "$1/$2").replace(" 여행", "")}</span>
          </div>
        </div>
        <div className="map-pin-row preview-actions">
          <span>✦ AI 추천</span>
          <span>지도 고정</span>
        </div>
      </div>
      <div className="swipe-preview-map">
        <div className="swipe-preview-days">
          <div>
            <i className="day-background-number">{day.label.replace(/\D/g, "")}</i>
            <span>{compactDateLabel(day.date)}</span>
          </div>
        </div>
        <i />
        <i />
        <i />
        <span>
          {day.start.name} → {day.goal.name}
        </span>
      </div>
      <div className="swipe-preview-heading">
        <strong>{day.label} 일정</strong>
        <span>각 구간의 거리와 예상 시간</span>
      </div>
      <div className="swipe-preview-stops">
        {stops.slice(0, 6).map((place, index) => (
          <div key={`${place.name}-${index}`}>
            <i>{index === 0 ? "S" : index === stops.length - 1 ? "G" : index}</i>
            <span>{place.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
