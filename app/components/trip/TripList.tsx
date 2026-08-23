import { tripStatusLabel } from "../../domain/trip";
import type { TripPlan } from "../../domain/types";
import SectionTitle from "../SectionTitle";

export default function TripList({
  trips,
  displayedTrips,
  activeTripId,
  onAdd,
  onOpen,
  onRename,
  onRemove,
}: {
  trips: TripPlan[];
  displayedTrips: TripPlan[];
  activeTripId: string;
  onAdd: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="page trips-page">
      <SectionTitle
        title="내 여행"
        subtitle="날짜별 일정과 후보 장소를 여행 단위로 관리해요"
        action="＋ 새 여행"
        onClick={onAdd}
      />
      <div className="trip-list">
        {displayedTrips.map((trip) => (
          <div
            className={`trip-card ${trip.id === activeTripId ? "active" : ""}`}
            key={trip.id}
            role="button"
            tabIndex={0}
            aria-label={`${trip.title} 일정 열기`}
            onClick={() => onOpen(trip.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(trip.id);
              }
            }}
          >
            <button
              className="trip-delete"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(trip.id);
              }}
              disabled={trips.length <= 1}
              aria-label={`${trip.title} 삭제`}
            >
              ×
            </button>
            <span className="trip-status">{tripStatusLabel(trip, activeTripId)}</span>
            <div className="trip-title-row">
              <h3>{trip.title}</h3>
              <button
                className="trip-rename"
                onClick={(event) => {
                  event.stopPropagation();
                  onRename(trip.id);
                }}
                aria-label={`${trip.title} 이름 변경`}
                title="이름 변경"
              >
                <span aria-hidden="true">✏︎</span>
              </button>
            </div>
            <p>
              {trip.days[0]?.date} – {trip.days[trip.days.length - 1]?.date}
            </p>
            <div className="trip-meta">
              <span>{trip.days.length}일</span>
              <span>장소 {trip.days.reduce((count, day) => count + day.places.length, 0)}곳</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
