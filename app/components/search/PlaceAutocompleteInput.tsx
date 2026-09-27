"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "../../domain/types";

export type PlaceAutocompleteProps = {
  loadSuggestions: (query: string, signal: AbortSignal) => Promise<Place[]>;
  onSuggestionSelect: (place: Place) => void;
};

export default function PlaceAutocompleteInput({
  value,
  onChange,
  placeholder,
  label,
  loadSuggestions,
  onSuggestionSelect,
}: PlaceAutocompleteProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const [resultQuery, setResultQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const term = value.trim();
  const open = focused && !composing && term.length >= 2;
  const visible = resultQuery === term ? suggestions : [];
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setFocused(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", dismiss);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("검색 중…");
      try {
        const places = await loadSuggestions(term, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(places.slice(0, 5));
        setResultQuery(term);
        setActive(-1);
        setStatus(places.length ? "" : "일치하는 장소가 없어요. 검색어를 더 입력해 주세요.");
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setResultQuery(term);
          setStatus("자동완성을 불러오지 못했어요. 검색 버튼으로 다시 시도해 주세요.");
        }
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, term, loadSuggestions]);
  const select = (place: Place) => {
    setFocused(false);
    onSuggestionSelect(place);
  };
  return (
    <div className="place-autocomplete" ref={root}>
      <input
        value={value}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open && active >= 0 && visible[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          setActive(-1);
          setStatus("");
          setFocused(true);
          onChange(event.target.value);
        }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={(event) => {
          if (composing || event.nativeEvent.isComposing) {
            if (event.key === "Enter") event.preventDefault();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setFocused(false);
          }
          if (open && visible.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setActive(
              (index) =>
                (index + (event.key === "ArrowDown" ? 1 : index < 0 ? 0 : -1) + visible.length) % visible.length,
            );
          }
          if (event.key === "Enter") {
            if (open && visible[active]) {
              event.preventDefault();
              select(visible[active]);
            } else setFocused(false);
          }
        }}
      />
      {open && (
        <div className="place-autocomplete-panel">
          <div id={id} role="listbox" aria-label="장소 자동완성">
            {visible.map((place, index) => (
              <div
                key={place.id}
                id={`${id}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === active}
                className="place-autocomplete-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(place)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    select(place);
                  }
                }}
              >
                <strong>{place.name}</strong>
                <span>{place.address || place.category}</span>
              </div>
            ))}
          </div>
          <p role="status">
            {visible.length
              ? "장소를 선택한 뒤 추가·저장을 눌러 주세요"
              : status || "입력을 마치면 가까운 장소를 찾아드려요"}
          </p>
        </div>
      )}
    </div>
  );
}
