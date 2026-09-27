"use client";

import PlaceNameLink from "../navigation/PlaceNameLink";
import PlaceAutocompleteInput, { type PlaceAutocompleteProps } from "./PlaceAutocompleteInput";
import { type FormEvent, type RefObject, useEffect, useRef, useState } from "react";
import NaverMap from "../../NaverMap";
import { distanceLabel, placeCategories, pointDistance } from "../../domain/place";
import type { Place, RouteEndpoint, SavedCategory, SearchSource } from "../../domain/types";
import ScheduleTimeField from "../schedule/ScheduleTimeField";
import SectionTitle from "../SectionTitle";

type CategoryFilter = "전체" | SavedCategory;

export default function PlaceSearchPage({
  autocomplete,
  dayLabel,
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
  autocomplete: PlaceAutocompleteProps;
  dayLabel: string;
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
  onSelectPlace: (place: Place, scheduledTime?: string) => void;
  onSavedCategoryChange: (category: CategoryFilter) => void;
  onOpenSavedPlaces: () => void;
}) {
  const [scheduledTime, setScheduledTime] = useState("");
  const [showMap, setShowMap] = useState(false);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const searchVisible = results.length > 0 || Boolean(error);

  useEffect(() => {
    if (!searchVisible) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest(".schedule-time-field")) return;
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
    <section className="page map-page place-picker">
      {choosingPlace && (
        <header className="place-picker-context">
          <div className="place-picker-heading">
            <strong>
              {dayLabel} ·{" "}
              {endpointTarget
                ? endpointTarget === "start"
                  ? "출발지 변경"
                  : "목적지 변경"
                : candidateFor
                  ? "후보 추가"
                  : "장소 추가"}
            </strong>
            <button type="button" onClick={onCancelSelection} aria-label="장소 선택 취소">
              ×
            </button>
          </div>
          {insertIndex !== null ? (
            <div className="place-picker-route">
              <span>{insertionFrom}</span>
              <b aria-label="이 사이에 추가">＋</b>
              <span>{insertionTo}</span>
            </div>
          ) : (
            <p>
              {candidateFor
                ? `${places.find((item) => item.id === candidateFor)?.name} 대신 갈 곳을 선택하세요`
                : "검색하거나 저장한 장소에서 선택하세요"}
            </p>
          )}
        </header>
      )}
      <div className="map-wrap">
        <form ref={searchFormRef} className="place-search" onSubmit={onSearch}>
          <PlaceAutocompleteInput
            {...autocomplete}
            value={query}
            onChange={onQueryChange}
            placeholder={choosingPlace ? "추가할 장소를 검색하세요" : "주소, 관광지, 식당을 검색하세요"}
            label="장소 검색"
          />
          <button disabled={searching}>{searching ? "검색 중" : "검색"}</button>
        </form>
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
        {!candidateFor && (
          <ScheduleTimeField
            label={
              endpointTarget === "start" ? "출발 시간" : endpointTarget === "goal" ? "도착 시간" : "방문 예정 시간"
            }
            value={scheduledTime}
            onChange={setScheduledTime}
          />
        )}
        <button
          className="place-picker-map-toggle"
          type="button"
          aria-expanded={showMap}
          onClick={() => setShowMap((value) => !value)}
        >
          {showMap ? "지도 접기" : "현재 경로 지도 보기"}
        </button>
        {showMap && (
          <div className="place-picker-map">
            <NaverMap places={places} start={start} goal={goal} />
          </div>
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
                  <strong>
                    <PlaceNameLink place={place} />
                  </strong>
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
                  <button
                    onClick={() => onSelectPlace(place, scheduledTime || undefined)}
                    disabled={selectionDisabled(place)}
                  >
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
                <h3>
                  <PlaceNameLink place={place} />
                </h3>
                <p>{place.address}</p>
                <span>{place.category}</span>
              </div>
              <button
                onClick={() => onSelectPlace(place, scheduledTime || undefined)}
                disabled={selectionDisabled(place)}
              >
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
