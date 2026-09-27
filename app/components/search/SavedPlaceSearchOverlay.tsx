"use client";

import PlaceNameLink from "../navigation/PlaceNameLink";
import type { FormEvent } from "react";
import type { Place } from "../../domain/types";

export default function SavedPlaceSearchOverlay({
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
  return (
    <>
      <div className="saved-search-dismiss-layer" role="presentation" onPointerDown={onDismiss} />
      <section className="saved-inline-search" aria-label="내 장소 검색">
        <form onSubmit={onSearch}>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="저장할 장소 이름이나 주소를 검색하세요"
            aria-label="저장할 장소 검색"
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
