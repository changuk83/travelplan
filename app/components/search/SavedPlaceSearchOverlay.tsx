"use client";

import PlaceNameLink from "../navigation/PlaceNameLink";
import PlaceAutocompleteInput, { type PlaceAutocompleteProps } from "./PlaceAutocompleteInput";
import { useEffect, useRef, type FormEvent } from "react";
import type { Place } from "../../domain/types";

export default function SavedPlaceSearchOverlay({
  autocomplete,
  query,
  results,
  searching,
  error,
  savedPlaces,
  onQueryChange,
  onSearch,
  onDismiss,
  onSave,
}: {
  autocomplete: PlaceAutocompleteProps;
  query: string;
  results: Place[];
  searching: boolean;
  error: string;
  savedPlaces: Place[];
  onQueryChange: (value: string) => void;
  onSearch: (event: FormEvent) => void;
  onDismiss: () => void;
  onSave: (place: Place) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (panelRef.current?.contains(event.target) || event.target.closest('[role="dialog"], .dialog-backdrop')) return;
      onDismiss();
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [onDismiss]);
  return (
    <>
      <section ref={panelRef} className="saved-inline-search" aria-label="내 장소 검색">
        <form onSubmit={onSearch}>
          <PlaceAutocompleteInput
            {...autocomplete}
            value={query}
            onChange={onQueryChange}
            placeholder="저장할 장소 이름이나 주소를 검색하세요"
            label="저장할 장소 검색"
          />
          <button type="submit" disabled={searching}>
            {searching ? "검색 중" : "검색"}
          </button>
        </form>
        <p className="saved-search-help">검색 결과에서 원하는 장소를 내 장소에 바로 저장할 수 있어요.</p>
        {error && <div className="saved-search-empty">{error}</div>}
        <div className="saved-search-results">
          {results.map((place) => (
            <article key={place.id}>
              <div>
                <strong>
                  <PlaceNameLink place={place} />
                </strong>
                <p>
                  {place.category} · {place.address}
                </p>
              </div>
              <button onClick={() => onSave(place)} disabled={savedPlaces.some((item) => item.id === place.id)}>
                {savedPlaces.some((item) => item.id === place.id) ? "저장됨" : "＋ 내 장소에 저장"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
