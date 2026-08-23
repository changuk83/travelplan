import type { DayPlan } from "../../domain/types";

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
      <div className="swipe-preview-hero">
        <div className="swipe-preview-hero-top">
          <span>{tripRange}</span>
          <span>맑음 27°</span>
        </div>
        <strong>{tripTitle}</strong>
        <div className="swipe-preview-stats">
          <span>{day.label}</span>
          <span>경유지 {day.places.length}곳</span>
          <span>자동 저장</span>
        </div>
      </div>
      <div className="swipe-preview-days">
        <div>
          <strong>{day.label}</strong>
          <span>{day.date}</span>
        </div>
      </div>
      <div className="swipe-preview-pin-row">
        <span>스크롤할 때 지도 고정</span>
      </div>
      <div className="swipe-preview-map">
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
