import type { DayPlan } from "../../domain/types";

export default function DaySwitcher({
  days,
  activeDayId,
  onSelect,
  onAdd,
  onEditDate,
  onRemove,
}: {
  days: DayPlan[];
  activeDayId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEditDate: (day: DayPlan) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="day-switcher" role="tablist" aria-label="여행 날짜">
      {days.map((day) => (
        <div className={`day-tab ${day.id === activeDayId ? "active" : ""}`} key={day.id}>
          <button
            role="tab"
            aria-selected={day.id === activeDayId}
            className="day-select"
            onClick={() => onSelect(day.id)}
          >
            <strong>{day.label}</strong>
            <span>{day.date}</span>
          </button>
          <button className="day-date-edit" onClick={() => onEditDate(day)} aria-label={`${day.label} 날짜 수정`}>
            ▣
          </button>
          <button
            className="day-remove"
            onClick={() => onRemove(day.id)}
            disabled={days.length <= 1}
            aria-label={`${day.label} 삭제`}
          >
            ×
          </button>
        </div>
      ))}
      <button className="add-day" onClick={onAdd} aria-label="여행 날짜 추가">
        ＋
      </button>
    </div>
  );
}
