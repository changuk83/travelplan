"use client";

import PlaceNameLink from "../navigation/PlaceNameLink";
import { Fragment, PointerEvent as ReactPointerEvent } from "react";
import type { RouteLeg } from "../../NaverMap";
import type { DayPlan, Place } from "../../domain/types";
import NavigationLinks from "../navigation/NavigationLinks";
import ScheduleTimeField from "./ScheduleTimeField";
import LegSummary from "./LegSummary";
import ScheduleStop from "./ScheduleStop";
import TimelineInsertion from "./TimelineInsertion";

type Props = {
  day: DayPlan;
  onTimeChange: (key: string, time: string) => void;
  legs: RouteLeg[];
  dragIndex: number | null;
  onChooseEndpoint: (target: "start" | "goal") => void;
  onChooseInsertion: (index: number) => void;
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

export default function ScheduleTimeline({
  day,
  onTimeChange,
  legs,
  dragIndex,
  onChooseEndpoint,
  onChooseInsertion,
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
  const places = day.places;
  return (
    <div className={`timeline sortable ${dragIndex !== null ? "is-sorting" : ""}`}>
      <article className="timeline-item fixed-stop">
        <time>출발</time>
        <div className="stop-dot">S</div>
        <div className="stop-content">
          <div className="stop-title-row">
            <h3>
              <PlaceNameLink place={day.start} />
            </h3>
          </div>
          <p>{day.label} 출발지예요</p>
          <ScheduleTimeField
            label="출발 시간"
            value={day.scheduleTimes?.start ?? ""}
            onChange={(time) => onTimeChange("start", time)}
          />
          <div className="stop-actions">
            <button className="add-place" onClick={() => onChooseEndpoint("start")}>
              출발지 변경
            </button>
            {day.start.name !== "출발지 미정" && <NavigationLinks place={day.start} />}
          </div>
        </div>
      </article>
      <TimelineInsertion index={0} disabled={places.length >= 30} onAdd={onChooseInsertion} />
      {places.map((place, index) => (
        <Fragment key={place.id}>
          <ScheduleStop
            place={place}
            scheduledTime={day.scheduleTimes?.[`place:${place.id}`] ?? ""}
            onTimeChange={(time) => onTimeChange(`place:${place.id}`, time)}
            index={index}
            leg={legs[index]}
            alternatives={day.candidates?.[place.id] ?? []}
            dragging={dragIndex === index}
            onBeginDrag={onBeginDrag}
            onContinueDrag={onContinueDrag}
            onEndDrag={onEndDrag}
            onRemove={onRemove}
            onEditMemo={onEditMemo}
            onAddCandidate={onAddCandidate}
            onRemoveCandidate={onRemoveCandidate}
            onPromoteCandidate={onPromoteCandidate}
            onPreviewCandidate={onPreviewCandidate}
          />
          <TimelineInsertion index={index + 1} disabled={places.length >= 30} onAdd={onChooseInsertion} />
        </Fragment>
      ))}
      <article className="timeline-item fixed-stop">
        <time>도착</time>
        <div className="stop-dot">G</div>
        <div className="stop-content">
          <div className="stop-title-row">
            <h3>
              <PlaceNameLink place={day.goal} />
            </h3>
          </div>
          <p>{day.goal.name === "목적지 미정" ? "검색해서 목적지를 정해 주세요." : `${day.label} 최종 목적지예요`}</p>
          <ScheduleTimeField
            label="도착 시간"
            value={day.scheduleTimes?.goal ?? ""}
            onChange={(time) => onTimeChange("goal", time)}
          />
          {day.goal.name !== "목적지 미정" && <LegSummary leg={legs[places.length]} />}
          <div className="stop-actions">
            <button className="add-place" onClick={() => onChooseEndpoint("goal")}>
              목적지 변경
            </button>
            {day.goal.name !== "목적지 미정" && <NavigationLinks place={day.goal} />}
          </div>
        </div>
      </article>
    </div>
  );
}
