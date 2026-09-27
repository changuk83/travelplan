"use client";

import PlaceNameLink from "../navigation/PlaceNameLink";
import { PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import type { RouteLeg } from "../../NaverMap";
import type { Place } from "../../domain/types";
import NavigationLinks from "../navigation/NavigationLinks";
import LegSummary from "./LegSummary";

type Props = {
  place: Place;
  index: number;
  leg?: RouteLeg;
  alternatives: Place[];
  dragging: boolean;
  onBeginDrag: (index: number, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onContinueDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onEndDrag: () => void;
  onRemove: (id: string) => void;
  onEditMemo: (place: Place) => void;
  onAddCandidate: (id: string) => void;
  onRemoveCandidate: (mainId: string, id: string) => void;
  onPromoteCandidate: (mainId: string, id: string) => void;
  onPreviewCandidate: (mainId: string, place?: Place) => void;
};

export default function ScheduleStop({
  place,
  index,
  leg,
  alternatives,
  dragging,
  onBeginDrag,
  onContinueDrag,
  onEndDrag,
  onRemove,
  onEditMemo,
  onAddCandidate,
  onRemoveCandidate,
  onPromoteCandidate,
  onPreviewCandidate,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const slideCount = alternatives.length + 1;
  function goToSlide(target: number) {
    const next = Math.max(0, Math.min(target, slideCount - 1));
    const element = trackRef.current?.children.item(next) as HTMLElement | null;
    element?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setActiveSlide(next);
    onPreviewCandidate(place.id, next === 0 ? undefined : alternatives[next - 1]);
  }
  return (
    <article
      data-order-index={index}
      className={`timeline-item user-stop candidate-stop ${dragging ? "dragging" : ""}`}
    >
      <button
        className="drag-handle"
        onPointerDown={(event) => onBeginDrag(index, event)}
        onPointerMove={onContinueDrag}
        onPointerUp={onEndDrag}
        onPointerCancel={onEndDrag}
        aria-label={`${place.name} 순서 끌기`}
      >
        ≡
      </button>
      <div className="stop-dot">{index + 1}</div>
      <div className="candidate-carousel">
        <div
          ref={trackRef}
          className={`candidate-track ${alternatives.length ? "has-alternatives" : ""}`}
          onScroll={(event) => {
            const track = event.currentTarget;
            const center = track.scrollLeft + track.clientWidth / 2;
            let closest = 0;
            let distance = Number.POSITIVE_INFINITY;
            Array.from(track.children).forEach((child, i) => {
              const element = child as HTMLElement;
              const nextDistance = Math.abs(element.offsetLeft + element.offsetWidth / 2 - center);
              if (nextDistance < distance) {
                closest = i;
                distance = nextDistance;
              }
            });
            if (closest !== activeSlide) {
              setActiveSlide(closest);
              onPreviewCandidate(place.id, closest === 0 ? undefined : alternatives[closest - 1]);
            }
          }}
        >
          <div className="candidate-slide main-slide">
            <button
              className="schedule-remove"
              onClick={() => onRemove(place.id)}
              aria-label={`${place.name} 일정에서 삭제`}
              title="일정에서 삭제"
            >
              ×
            </button>
            <span className="candidate-kind">메인 · 1/{slideCount}</span>
            <div className="stop-title-row">
              <h3>
                <PlaceNameLink place={place} />
              </h3>
            </div>
            <p>
              {place.category} · {place.address}
            </p>
            {place.memo && <p className="place-memo">메모 · {place.memo}</p>}
            <LegSummary leg={leg} />
            <div className="stop-actions">
              <button
                className={`place-memo-icon schedule-memo-icon ${place.memo ? "has-memo" : ""}`}
                onClick={() => onEditMemo(place)}
                aria-label={`${place.name} ${place.memo ? "메모 수정" : "메모 추가"}`}
                title={place.memo ? "메모 수정" : "메모 추가"}
              >
                <span aria-hidden="true" />
              </button>
              <NavigationLinks place={place} />
              <button className="candidate-add" onClick={() => onAddCandidate(place.id)}>
                ＋ 후보
              </button>
            </div>
          </div>
          {alternatives.map((candidate, i) => (
            <div className="candidate-slide alternative" key={candidate.id}>
              <button
                className="schedule-remove"
                onClick={() => onRemoveCandidate(place.id, candidate.id)}
                aria-label={`${candidate.name} 후보 삭제`}
                title="후보 삭제"
              >
                ×
              </button>
              <span className="candidate-kind">
                후보 {i + 1} · {i + 2}/{slideCount}
              </span>
              <div className="stop-title-row">
                <h3>
                  <PlaceNameLink place={candidate} />
                </h3>
              </div>
              <p>
                {candidate.category} · {candidate.address}
              </p>
              {candidate.memo && <p className="place-memo">메모 · {candidate.memo}</p>}
              <div className="stop-actions">
                <button
                  className="promote-candidate"
                  onClick={() => onPromoteCandidate(place.id, candidate.id)}
                  aria-label={`${candidate.name} 메인 장소로 변경`}
                  title="메인 장소로 변경"
                >
                  <span aria-hidden="true">⇤</span>
                </button>
                <button
                  className={`place-memo-icon schedule-memo-icon ${candidate.memo ? "has-memo" : ""}`}
                  onClick={() => onEditMemo(candidate)}
                  aria-label={`${candidate.name} ${candidate.memo ? "메모 수정" : "메모 추가"}`}
                  title={candidate.memo ? "메모 수정" : "메모 추가"}
                >
                  <span aria-hidden="true" />
                </button>
                <NavigationLinks place={candidate} />
              </div>
            </div>
          ))}
        </div>
        {alternatives.length > 0 && (
          <>
            <button
              className="candidate-arrow previous"
              onClick={() => goToSlide(activeSlide - 1)}
              disabled={activeSlide === 0}
              aria-label="이전 후보"
            >
              ‹
            </button>
            <button
              className="candidate-arrow next"
              onClick={() => goToSlide(activeSlide + 1)}
              disabled={activeSlide === slideCount - 1}
              aria-label="다음 후보"
            >
              ›
            </button>
            <div className="candidate-dots" aria-label={`${activeSlide + 1}/${slideCount}`}>
              {Array.from({ length: slideCount }, (_, i) => (
                <button
                  key={i}
                  className={i === activeSlide ? "active" : ""}
                  onClick={() => goToSlide(i)}
                  aria-label={`${i + 1}번째 후보 보기`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
