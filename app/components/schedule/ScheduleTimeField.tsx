"use client";

import { useEffect, useId, useRef, useState } from "react";

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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  const close = () => {
    setEditing(false);
    trigger.current?.focus();
  };
  const [hour, minute] = value.split(":");
  const display = value ? `${Number(hour) < 12 ? "오전" : "오후"} ${Number(hour) % 12 || 12}:${minute}` : "시간 추가";
  return (
    <div className="schedule-time-field">
      <div className="schedule-time-summary">
        <button
          ref={trigger}
          type="button"
          className={`schedule-time-chip${value ? " is-set" : ""}`}
          disabled={disabled}
          aria-expanded={editing}
          aria-controls={editing ? id : undefined}
          aria-label={`${label}: ${value || "미정"}, ${value ? "수정" : "추가"}`}
          onClick={() => {
            setDraft(value);
            setEditing(!editing);
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>{display}</span>
          {!value && (
            <span aria-hidden="true" className="schedule-time-plus">
              +
            </span>
          )}
        </button>
        {value && !editing && (
          <button
            className="schedule-time-clear"
            type="button"
            onClick={() => onChange("")}
            disabled={disabled}
            aria-label={`${label} 지우기`}
            title="시간 지우기"
          >
            ×
          </button>
        )}
      </div>
      {editing && (
        <div id={id} className="schedule-time-editor" role="group" aria-label={`${label} 편집`}>
          <label htmlFor={`${id}-input`}>
            {label} <span>선택</span>
          </label>
          <div className="schedule-time-editor-row">
            <input
              id={`${id}-input`}
              ref={input}
              type="time"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={disabled}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  close();
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!disabled) {
                    onChange(draft);
                    close();
                  }
                }
              }}
            />
            <button
              className="schedule-time-apply"
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(draft);
                close();
              }}
            >
              적용
            </button>
            <button className="schedule-time-cancel" type="button" onClick={close}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
