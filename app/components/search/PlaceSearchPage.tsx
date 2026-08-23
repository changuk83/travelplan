"use client";

import { type FormEvent, type RefObject, useEffect, useRef } from "react";
import NaverMap from "../../NaverMap";
import { distanceLabel, placeCategories, pointDistance } from "../../domain/place";
import type { Place, RouteEndpoint, SavedCategory, SearchSource } from "../../domain/types";
import SectionTitle from "../SectionTitle";

type CategoryFilter = "전체" | SavedCategory;

export default function PlaceSearchPage({
  places,
  start,
  goal,
  query,
  searching,
  results,
  error,
  source,
  choosingPlace,
  endpointTarget,
  candidateFor,
  insertIndex,
  insertionFrom,
  insertionTo,
  previousPlace,
  savedPlaces,
  savedCategories,
  savedCategory,
  filteredSavedPlaces,
  savedPlacesRef,
  onQueryChange,
  onSearch,
  onDismissResults,
  onCancelSelection,
  onScrollToSaved,
  onToggleSaved,
  onSelectPlace,
  onSavedCategoryChange,
  onOpenSavedPlaces,
}: {
  places: Place[];
  start: RouteEndpoint;
  goal: RouteEndpoint;
  query: string;
  searching: boolean;
  results: Place[];
  error: string;
  source: SearchSource;
  choosingPlace: boolean;
  endpointTarget: "start" | "goal" | null;
  candidateFor: string | null;
  insertIndex: number | null;
  insertionFrom: string;
  insertionTo: string;
  previousPlace: RouteEndpoint | null;
  savedPlaces: Place[];
  savedCategories: SavedCategory[];
  savedCategory: CategoryFilter;
  filteredSavedPlaces: Place[];
  savedPlacesRef: RefObject<HTMLDivElement | null>;
  onQueryChange: (value: string) => void;
  onSearch: (event: FormEvent) => void;
  onDismissResults: () => void;
  onCancelSelection: () => void;
  onScrollToSaved: () => void;
  onToggleSaved: (place: Place) => void;
  onSelectPlace: (place: Place) => void;
  onSavedCategoryChange: (category: CategoryFilter) => void;
  onOpenSavedPlaces: () => void;
}) {
  const searchFormRef = useRef<HTMLFormElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const searchVisible = results.length > 0 || Boolean(error);

  useEffect(() => {
    if (!searchVisible) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (searchFormRef.current?.contains(target) || searchResultsRef.current?.contains(target)) return;
      onDismissResults();
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    return () => document.removeEventListener("pointerdown", dismissOutside, true);
  }, [searchVisible, onDismissResults]);

  const selectionLabel = (place: Place) =>
    endpointTarget
      ? `${endpointTarget === "start" ? "출발지" : "목적지"}로 설정`
      : candidateFor
        ? "후보 등록"
        : places.some((item) => item.id === place.id)
          ? "추가됨"
          : insertIndex !== null
            ? "이 구간에 추가"
            : "경로 추가";
  const selectionDisabled = (place: Place) =>
    !endpointTarget && !candidateFor && places.some((item) => item.id === place.id);

  return (
    <section className="page map-page">
      <div className="map-wrap">
        <NaverMap places={places} start={start} goal={goal} />
        <form ref={searchFormRef} className="place-search" onSubmit={onSearch}>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={choosingPlace ? "추가할 장소를 검색하세요" : "주소, 관광지, 식당을 검색하세요"}
            aria-label="장소 검색"
          />
          <button disabled={searching}>{searching ? "검색 중" : "검색"}</button>
        </form>
        {endpointTarget && (
          <div className="insertion-banner">
            <strong>{endpointTarget === "start" ? "출발지" : "목적지"}로 사용할 장소를 선택하세요</strong>
            <button onClick={onCancelSelection}>취소</button>
          </div>
        )}
        {candidateFor !== null && (
          <div className="insertion-banner">
            <strong>{places.find((item) => item.id === candidateFor)?.name} 대신 갈 후보를 선택하세요</strong>
            <button onClick={onCancelSelection}>취소</button>
          </div>
        )}
        {insertIndex !== null && (
          <div className="insertion-banner">
            <strong>
              장소 추가 · {insertionFrom} → {insertionTo}
            </strong>
            <button onClick={onCancelSelection}>취소</button>
          </div>
        )}
        {choosingPlace && (
          <button type="button" className="saved-place-guide" onClick={onScrollToSaved}>
            <span aria-hidden="true">♡</span>
            <strong>
              {savedPlaces.length
                ? "검색하거나, 아래 저장한 장소에서 선택할 수 있어요"
                : "검색 결과의 ♡를 눌러 장소를 저장할 수도 있어요"}
            </strong>
            <span aria-hidden="true">↓</span>
          </button>
        )}
        {searchVisible && (
          <div ref={searchResultsRef} className={`search-results ${choosingPlace ? "with-insertion" : ""}`}>
            {source === "geocoding" && (
              <p className="search-notice">장소 검색 결과가 없어 주소 검색 결과를 표시했어요.</p>
            )}
            {error && <p className="search-error">{error}</p>}
            {results.map((place) => (
              <article key={place.id}>
                <div>
                  <strong>{place.name}</strong>
                  <p>
                    {place.category} · {place.address}
                  </p>
                  {previousPlace && (
                    <p className="search-result-distance">
                      이전 장소에서 약 {distanceLabel(pointDistance(previousPlace, place))} · 직선거리
                    </p>
                  )}
                </div>
                <div className="search-result-actions">
                  <button className="save-place" onClick={() => onToggleSaved(place)}>
                    {savedPlaces.some((item) => item.id === place.id) ? "♥ 저장됨" : "♡ 저장"}
                  </button>
                  <button onClick={() => onSelectPlace(place)} disabled={selectionDisabled(place)}>
                    {selectionLabel(place)}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <div ref={savedPlacesRef} className="rest-panel">
        <div className="panel-handle" />
        <SectionTitle
          compact
          title={`저장한 장소 ${filteredSavedPlaces.length}곳`}
          subtitle={
            savedCategory === "전체"
              ? "카테고리를 고르거나 저장한 장소를 바로 선택하세요"
              : `‘${savedCategory}’ 카테고리에서 선택하고 있어요`
          }
          action="전체 보기"
          onClick={onOpenSavedPlaces}
        />
        {savedPlaces.length > 0 && (
          <div
            className="saved-category-tabs route-saved-category-tabs"
            role="tablist"
            aria-label="추가할 저장 장소 카테고리"
          >
            {(["전체", ...savedCategories] as const).map((category) => {
              const count =
                category === "전체"
                  ? savedPlaces.length
                  : savedPlaces.filter((place) => placeCategories(place).includes(category)).length;
              return (
                <button
                  key={category}
                  role="tab"
                  aria-selected={savedCategory === category}
                  className={savedCategory === category ? "active" : ""}
                  onClick={() => onSavedCategoryChange(category)}
                >
                  {category} <span>{count}</span>
                </button>
              );
            })}
          </div>
        )}
        {filteredSavedPlaces.length ? (
          filteredSavedPlaces.map((place) => (
            <article className="rest-card" key={place.id}>
              <div className="rest-symbol">♡</div>
              <div className="rest-copy">
                <h3>{place.name}</h3>
                <p>{place.address}</p>
                <span>{place.category}</span>
              </div>
              <button onClick={() => onSelectPlace(place)} disabled={selectionDisabled(place)}>
                {selectionLabel(place)}
              </button>
            </article>
          ))
        ) : (
          <div className="saved-empty">
            <strong>
              {savedPlaces.length ? `‘${savedCategory}’ 카테고리에 저장한 장소가 없어요` : "저장한 장소가 없어요"}
            </strong>
            <p>{savedPlaces.length ? "다른 카테고리를 선택해 보세요." : "위 검색 결과에서 ♡ 저장을 눌러보세요."}</p>
          </div>
        )}
      </div>
    </section>
  );
}
