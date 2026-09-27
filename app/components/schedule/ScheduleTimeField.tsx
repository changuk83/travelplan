"use client";

export default function ScheduleTimeField({
  label = "방문 예정 시간",
  value,
  onChange,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="schedule-time-field">
      <label>
        <span>
          {label} <small>(선택)</small>
        </span>
        <input type="time" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
      </label>
      {value && (
        <button type="button" onClick={() => onChange("")} disabled={disabled} aria-label={`${label} 지우기`}>
          시간 지우기
        </button>
      )}
    </div>
  );
}
