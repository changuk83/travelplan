import type { DayPlan } from "../../domain/types";
import { compactDateLabel } from "../../domain/date";
import { useEffect, useId, useRef, useState } from "react";

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
  const actionsRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [openDayId, setOpenDayId] = useState<string | null>(null);
  const selected = days.find((day) => day.id === activeDayId) ?? days[0];
  const open = Boolean(selected && openDayId === selected.id);
  const menuId = useId();
  const close = () => {
    setOpenDayId(null);
    trigger.current?.focus();
  };
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>(".day-tab.active");
    if (!list || !tab) return;
    const item = tab.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    if (item.left < bounds.left) list.scrollLeft -= bounds.left - item.left + 6;
    else if (item.right > bounds.right) list.scrollLeft += item.right - bounds.right + 6;
  }, [activeDayId]);
  useEffect(() => {
    if (!open) return;
    actionsRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setOpenDayId(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div className="day-controls">
      <div ref={listRef} className="day-switcher" role="tablist" aria-label="여행 날짜">
        {days.map((day, index) => (
          <div className={`day-tab ${day.id === activeDayId ? "active" : ""}`} key={day.id}>
            <button
              role="tab"
              aria-selected={day.id === activeDayId}
              aria-label={`${day.label} ${day.date}`}
              className="day-select"
              onClick={() => {
                setOpenDayId(null);
                onSelect(day.id);
              }}
            >
              <i className="day-background-number" aria-hidden="true">
                {index + 1}
              </i>
              <span>{compactDateLabel(day.date)}</span>
            </button>
          </div>
        ))}
        <button className="add-day" onClick={onAdd} aria-label="여행 날짜 추가">
          ＋
        </button>
      </div>
      {selected && (
        <div
          className="day-actions"
          ref={actionsRef}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpenDayId(null);
          }}
        >
          <button
            ref={trigger}
            className="day-menu-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            aria-label={`${selected.label} ${selected.date} 날짜 메뉴`}
            onClick={() => setOpenDayId(open ? null : selected.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpenDayId(selected.id);
              }
              if (event.key === "Escape") close();
            }}
          >
            ⋯
          </button>
          {open && (
            <div
              id={menuId}
              className="day-action-menu"
              role="menu"
              tabIndex={-1}
              aria-label={`${selected.label} 날짜 관리`}
              onKeyDown={(event) => {
                const items = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
                );
                const index = items.indexOf(document.activeElement as HTMLButtonElement);
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? items.length - 1
                        : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
                  items[next]?.focus();
                }
              }}
            >
              <p>
                {selected.label} · {compactDateLabel(selected.date)}
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onEditDate(selected);
                }}
              >
                날짜 변경
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                disabled={days.length <= 1}
                onClick={() => {
                  close();
                  onRemove(selected.id);
                }}
              >
                이 날짜 삭제
              </button>
              {days.length <= 1 && <small>마지막 하루는 삭제할 수 없어요.</small>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
