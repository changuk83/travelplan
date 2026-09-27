import type { DayPlan } from "../../domain/types";
import { compactDateLabel } from "../../domain/date";
import { useEffect, useRef } from "react";

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
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>(".day-tab.active");
    if (!list || !selected) return;
    const item = selected.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    if (item.left < bounds.left) list.scrollLeft -= bounds.left - item.left + 6;
    else if (item.right > bounds.right) list.scrollLeft += item.right - bounds.right + 6;
  }, [activeDayId]);
  return (
    <div ref={listRef} className="day-switcher" role="tablist" aria-label="여행 날짜">
      {days.map((day, index) => (
        <div className={`day-tab ${day.id === activeDayId ? "active" : ""}`} key={day.id}>
          <button
            role="tab"
            aria-selected={day.id === activeDayId}
            aria-label={`${day.label} ${day.date}`}
            className="day-select"
            onClick={() => onSelect(day.id)}
          >
            <i className="day-background-number" aria-hidden="true">
              {index + 1}
            </i>
            <span>{compactDateLabel(day.date)}</span>
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
