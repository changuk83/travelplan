"use client";

import { useState } from "react";
import { isoDate, shortDate } from "../domain/date";

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const initial = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + dayCount }, (_, index) =>
    index < firstDay ? null : index - firstDay + 1,
  );
  const select = (day: number) => {
    const value = isoDate(month.getFullYear(), month.getMonth(), day);
    if (!startDate || endDate) {
      onChange(value, "");
      return;
    }
    if (value < startDate) {
      onChange(value, "");
      return;
    }
    onChange(startDate, value);
  };
  const nights =
    startDate && endDate
      ? Math.floor(
          (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000,
        ) + 1
      : 0;
  return (
    <div className="range-picker">
      <div className="range-summary">
        <div>
          <span>여행 기간</span>
          <strong>
            {startDate ? shortDate(startDate) : "시작일 선택"} <i>→</i>{" "}
            {endDate ? shortDate(endDate) : startDate ? "종료일 선택" : "날짜 미정"}
          </strong>
        </div>
        {startDate && (
          <button type="button" onClick={() => onChange("", "")}>
            초기화
          </button>
        )}
      </div>
      <div className="calendar-heading">
        <button
          type="button"
          onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}
          aria-label="이전 달"
        >
          ‹
        </button>
        <strong>
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </strong>
        <button
          type="button"
          onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}
          aria-label="다음 달"
        >
          ›
        </button>
      </div>
      <div className="calendar-weekdays">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-days">
        {cells.map((day, index) => {
          if (day === null) return <span key={`empty-${index}`} />;
          const value = isoDate(month.getFullYear(), month.getMonth(), day);
          const selected = value === startDate || value === endDate;
          const inRange = Boolean(startDate && endDate && value > startDate && value < endDate);
          return (
            <button
              type="button"
              key={value}
              className={`${selected ? "selected " : ""}${inRange ? "in-range " : ""}${value === startDate ? "range-start " : ""}${value === endDate ? "range-end" : ""}`}
              onClick={() => select(day)}
              aria-pressed={selected}
            >
              {day}
            </button>
          );
        })}
      </div>
      <p>
        {startDate && !endDate
          ? "종료일을 선택하세요. 같은 날을 다시 누르면 당일치기예요."
          : nights
            ? `${nights}일 여행 일정으로 만들어집니다.`
            : "날짜 없이 여행을 만들어도 나중에 지정할 수 있어요."}
      </p>
    </div>
  );
}
