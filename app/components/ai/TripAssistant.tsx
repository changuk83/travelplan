"use client";

import ScheduleTimeField from "../schedule/ScheduleTimeField";
import PlaceReputation from "./PlaceReputation";
import PlaceNameLink from "../navigation/PlaceNameLink";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { AiChatRequest, AiChatResponse, AiMessage, AiRecommendation } from "../../domain/ai";
import type { Place, TripPlan } from "../../domain/types";
import type { ScheduleAction } from "../../domain/schedule";
import "./TripAssistant.css";

type Props = {
  trip: TripPlan;
  trips?: TripPlan[];
  savedPlaces?: Place[];
  activeDayId: string;
  apiBase: string;
  onClose: () => void;
  onAdd: (recommendation: AiRecommendation) => string | null | Promise<string | null>;
  onSave: (place: Place) => string | null | Promise<string | null>;
  onApply?: (action: ScheduleAction) => Promise<string | null>;
};

type Turn = AiMessage & { id: number; recommendations?: AiRecommendation[]; actions?: ScheduleAction[] };

function ActionCard({ action, onApply }: { action: ScheduleAction; onApply?: Props["onApply"] }) {
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "cancelled">("idle");
  const [error, setError] = useState("");
  const busy = useRef(false);
  return (
    <article className="trip-ai-card trip-ai-action-card">
      <span className="trip-ai-category">
        {action.command.kind === "create_day_schedule" ? "새 하루 일정 미리보기" : "일정 변경 확인"}
      </span>
      <p>{action.label}</p>
      {action.command.kind === "update_place_memo" && (
        <div className="trip-ai-place-details">
          <section>
            <h4>현재 메모</h4>
            <p className="trip-ai-memo-text">{action.command.previousMemo || "없음"}</p>
          </section>
          <section>
            <h4>변경할 메모</h4>
            <p className="trip-ai-memo-text">{action.command.memo || "메모 비우기"}</p>
          </section>
          <p>이 여행의 같은 장소와 내 장소 메모에 반영됩니다. 다른 여행은 변경하지 않습니다.</p>
        </div>
      )}
      {action.command.kind === "create_day_schedule" && (
        <>
          <ol className="trip-ai-day-preview">
            {action.command.stops.map((stop, index) => (
              <li key={`${stop.place.id}-${index}`}>
                <span>{stop.scheduledTime || "시간 미정"}</span>
                <div>
                  <strong>
                    <PlaceNameLink place={stop.place} />
                  </strong>
                  <p>{stop.place.address}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="trip-ai-address">
            출발지·목적지는 그대로 유지합니다. 시간은 제안이며 영업시간과 실제 이동시간은 방문 전에 확인해 주세요. 아래
            버튼을 누르면 전체 장소가 함께 등록됩니다.
          </p>
        </>
      )}
      {status === "done" || status === "cancelled" ? (
        <p role="status">{status === "done" ? "일정에 반영했어요 ✓" : "이 변경은 취소했어요."}</p>
      ) : (
        <div className="trip-ai-card-actions">
          <button
            type="button"
            className="trip-ai-primary"
            disabled={!onApply || status === "pending"}
            onClick={async () => {
              if (!onApply || busy.current) return;
              busy.current = true;
              setStatus("pending");
              setError("");
              try {
                const result = await onApply(action);
                if (result) {
                  setError(result);
                  setStatus("idle");
                } else setStatus("done");
              } catch {
                setError("변경을 완료하지 못했어요. 다시 시도해 주세요.");
                setStatus("idle");
              } finally {
                busy.current = false;
              }
            }}
          >
            {status === "pending"
              ? "적용 중…"
              : action.command.kind === "remove_place"
                ? "삭제 확인"
                : action.command.kind === "create_day_schedule"
                  ? "이 하루 일정 등록"
                  : "변경 적용"}
          </button>
          <button type="button" disabled={status === "pending"} onClick={() => setStatus("cancelled")}>
            취소
          </button>
        </div>
      )}
      {!onApply && <p className="trip-ai-error">저장 연결을 확인한 뒤 변경할 수 있어요.</p>}
      {error && (
        <p className="trip-ai-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function RecommendationCard({
  apiBase,
  recommendation,
  trip,
  onAdd,
  onSave,
  onApply,
}: Pick<Props, "trip" | "onAdd" | "onSave" | "onApply" | "apiBase"> & { recommendation: AiRecommendation }) {
  const [scheduledTime, setScheduledTime] = useState("");
  const [selectedDayId, setSelectedDayId] = useState(recommendation.dayId);
  const [insertIndex, setInsertIndex] = useState(recommendation.insertIndex);
  const [added, setAdded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"place" | "candidate">("place");
  const [mainId, setMainId] = useState("");
  const [memo, setMemo] = useState(recommendation.place.memo ?? "");
  const candidateAction = useRef<ScheduleAction | null>(null);
  const busy = useRef(false);
  const day = trip.days.find((item) => item.id === selectedDayId) ?? trip.days[0];
  const position = day ? Math.max(0, Math.min(insertIndex, day.places.length)) : 0;
  const place = { ...recommendation.place, memo: memo.trim() };

  return (
    <article className="trip-ai-card">
      <span className="trip-ai-category">{place.category || "추천 장소"}</span>
      <h3>
        <PlaceNameLink place={place} />
      </h3>
      <p className="trip-ai-address">{place.address}</p>
      <div className="trip-ai-place-details">
        {recommendation.description && (
          <section>
            <h4>어떤 곳인가요</h4>
            <p>{recommendation.description}</p>
          </section>
        )}
        <section>
          <h4>추천 이유</h4>
          <p>{recommendation.reason}</p>
        </section>
      </div>
      {recommendation.distanceLabel && <p className="trip-ai-distance">{recommendation.distanceLabel}</p>}
      <PlaceReputation place={place} apiBase={apiBase} />
      {mode === "place" && (
        <ScheduleTimeField value={scheduledTime} onChange={setScheduledTime} disabled={pending || added} />
      )}
      <div className="trip-ai-card-fields">
        <label>
          메모 (선택)
          <textarea
            value={memo}
            maxLength={4000}
            rows={2}
            disabled={pending || added || saved}
            placeholder="먹어볼 메뉴, 방문 시 참고할 점"
            onChange={(event) => setMemo(event.target.value)}
          />
          <small>새로 등록하는 장소에 함께 저장됩니다. 기존 메모 수정은 AI에게 요청해 주세요.</small>
        </label>
        <label>
          등록 방식
          <select
            value={mode}
            disabled={pending || added}
            onChange={(event) => {
              setMode(event.target.value as "place" | "candidate");
              setError("");
            }}
          >
            <option value="place">일정에 추가</option>
            <option value="candidate">기존 장소의 후보로 등록</option>
          </select>
        </label>
        <label>
          추가할 일정
          <select
            value={day?.id ?? ""}
            disabled={pending || added || !day}
            onChange={(event) => {
              setSelectedDayId(event.target.value);
              setMainId("");
              setInsertIndex(trip.days.find((item) => item.id === event.target.value)?.places.length ?? 0);
              setError("");
            }}
          >
            {trip.days.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1}일차{item.date ? ` · ${item.date}` : ""}
              </option>
            ))}
          </select>
        </label>
        {mode === "candidate" ? (
          <label>
            어느 장소의 후보인가요?
            <select
              value={mainId}
              disabled={pending || added || !day}
              onChange={(event) => {
                setMainId(event.target.value);
                setError("");
              }}
            >
              <option value="">대상 장소를 선택하세요</option>
              {day?.places.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {!day?.places.length && <small>이 날짜에는 후보를 연결할 경유지가 없어요.</small>}
          </label>
        ) : (
          <label>
            넣을 위치
            <select
              value={position}
              disabled={pending || added || !day}
              onChange={(event) => {
                setInsertIndex(Number(event.target.value));
                setError("");
              }}
            >
              {day &&
                Array.from({ length: day.places.length + 1 }, (_, index) => (
                  <option key={index} value={index}>
                    {index === 0 ? day.start.name || "출발지" : day.places[index - 1].name}
                    {" → 여기 → "}
                    {index === day.places.length ? day.goal.name || "도착지" : day.places[index].name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <div className="trip-ai-card-actions">
        <button
          type="button"
          className="trip-ai-primary"
          disabled={pending || added || !day || (mode === "candidate" && (!mainId || !onApply))}
          onClick={async () => {
            if (!day || added || busy.current) return;
            busy.current = true;
            setPending(true);
            try {
              let result: string | null;
              if (mode === "candidate") {
                const main = day.places.find((item) => item.id === mainId);
                if (!main || !onApply) {
                  setError("후보를 연결할 장소를 선택해 주세요.");
                  return;
                }
                const command = {
                  kind: "add_candidate" as const,
                  tripId: trip.id,
                  dayId: day.id,
                  placeId: main.id,
                  candidate: place,
                };
                if (
                  !candidateAction.current ||
                  JSON.stringify(candidateAction.current.command) !== JSON.stringify(command)
                ) {
                  candidateAction.current = {
                    id: crypto.randomUUID(),
                    command,
                    label: `${main.name}의 후보로 ${place.name} 등록`,
                    expectedTripUpdatedAt: trip.updatedAt,
                  };
                }
                result = await onApply(candidateAction.current);
              } else
                result = await onAdd({
                  ...recommendation,
                  place,
                  dayId: day.id,
                  insertIndex: position,
                  scheduledTime: scheduledTime || undefined,
                });
              setError(result ?? "");
              if (!result) setAdded(true);
            } catch {
              setError("일정에 추가하지 못했어요. 다시 시도해 주세요.");
            } finally {
              busy.current = false;
              setPending(false);
            }
          }}
        >
          {added ? "등록됨 ✓" : mode === "candidate" ? "선택한 장소의 후보로 등록" : "일정에 추가"}
        </button>
        <button
          type="button"
          disabled={pending || saved}
          onClick={async () => {
            if (saved || busy.current) return;
            busy.current = true;
            setPending(true);
            try {
              const result = await onSave(place);
              setError(result ?? "");
              if (!result) setSaved(true);
            } catch {
              setError("내 장소에 저장하지 못했어요. 다시 시도해 주세요.");
            } finally {
              busy.current = false;
              setPending(false);
            }
          }}
        >
          {saved ? "내 장소에 저장됨 ✓" : "내 장소 저장"}
        </button>
      </div>
      {error && (
        <p className="trip-ai-error" role="alert">
          {error}
        </p>
      )}
      {(added || saved) && (
        <span className="trip-ai-sr-only" role="status">
          {place.name} {added ? "일정에 추가되었습니다." : "내 장소에 저장되었습니다."}
        </span>
      )}
    </article>
  );
}

export default function TripAssistant({
  trip,
  trips,
  savedPlaces = [],
  activeDayId,
  apiBase,
  onClose,
  onAdd,
  onSave,
  onApply,
}: Props) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const nextTurnRef = useRef(0);
  const dayIndex = trip.days.findIndex((day) => day.id === activeDayId);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      requestRef.current?.abort();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading, error]);

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
      ) ?? [],
    ).filter((element) => element.getClientRects().length > 0);
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submit(message: string) {
    const question = message.trim();
    if (!question || requestRef.current || question.length > 1500) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    const history: AiMessage[] = turns.slice(-10).map(({ role, content }) => ({ role, content }));
    try {
      const seenPlaces = new Set<string>();
      const recentPlaces = [...turns]
        .reverse()
        .flatMap((turn) => turn.recommendations?.map((item) => item.place) ?? [])
        .slice(0, 40);
      const availablePlaces = recentPlaces
        .filter((place) => {
          if (seenPlaces.has(place.id)) return false;
          seenPlaces.add(place.id);
          return true;
        })
        .slice(0, 200);
      const body: AiChatRequest = {
        message: question,
        trip,
        trips,
        activeDayId,
        history,
        availablePlaces,
        savedPlaces: savedPlaces.slice(0, 500),
      };
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const result = (await response.json()) as AiChatResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      if (typeof result.message !== "string" || !Array.isArray(result.recommendations)) {
        throw new Error("응답을 확인하지 못했어요. 다시 시도해 주세요.");
      }
      if (controller.signal.aborted) return;
      setTurns((previous) => [
        ...previous,
        { id: nextTurnRef.current++, role: "user", content: question },
        {
          id: nextTurnRef.current++,
          role: "assistant",
          content: result.message,
          recommendations: result.recommendations,
          actions: result.actions,
        },
      ]);
      setDraft("");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setDraft(question);
      setError(cause instanceof Error ? cause.message : "연결이 원활하지 않아요. 다시 시도해 주세요.");
    } finally {
      if (!controller.signal.aborted) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="trip-ai-overlay">
      <button
        type="button"
        className="trip-ai-backdrop"
        aria-label="AI 여행 도우미 닫기"
        tabIndex={-1}
        onClick={onClose}
      />
      {/* The modal owns Escape and Tab handling to keep keyboard focus inside. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="trip-ai-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-ai-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleKeys}
      >
        <header className="trip-ai-header">
          <div>
            <span className="trip-ai-eyebrow">길담과 함께 찾는 다음 장소</span>
            <h2 id="trip-ai-title">AI 여행 도우미</h2>
            <p>
              {trip.title} · {dayIndex >= 0 ? `${dayIndex + 1}일차` : "여행 일정"}
            </p>
          </div>
          <button type="button" className="trip-ai-close" aria-label="AI 여행 도우미 닫기" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="trip-ai-messages" ref={messagesRef} aria-busy={loading}>
          {turns.length === 0 && (
            <div className="trip-ai-welcome">
              <h3>여행 일정을 함께 준비해요</h3>
              <p>
                지금 여행의 동선을 참고해 장소를 찾아드려요.
                <br />
                일정을 물어보거나 장소 추가·삭제를 부탁해 보세요. 변경은 확인 후 반영돼요.
              </p>
              <div className="trip-ai-suggestions">
                {[
                  `${dayIndex >= 0 ? dayIndex + 1 : 1}일차에 들를 식당 추천해줘`,
                  dayIndex >= 0 && trip.days[dayIndex].places.length === 0
                    ? `${dayIndex + 1}일차 하루 코스를 새로 짜줘. 식사와 관광을 포함해줘`
                    : `${dayIndex >= 0 ? dayIndex + 1 : 1}일차 이동 경로에 들를 곳을 찾아줘`,
                  "현재 여행 일정 보여줘",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setDraft(prompt);
                      inputRef.current?.focus();
                    }}
                  >
                    {prompt}
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((turn) => (
            <section
              key={turn.id}
              className={`trip-ai-turn trip-ai-turn-${turn.role}`}
              aria-label={turn.role === "user" ? "내 질문" : "AI 답변"}
            >
              <p className="trip-ai-message">{turn.content}</p>
              {turn.actions?.map((action) => (
                <ActionCard key={action.id} action={action} onApply={onApply} />
              ))}
              {turn.recommendations?.map((recommendation, index) => (
                <RecommendationCard
                  key={`${recommendation.place.id}-${index}`}
                  recommendation={recommendation}
                  apiBase={apiBase}
                  trip={trip}
                  onAdd={onAdd}
                  onSave={onSave}
                  onApply={onApply}
                />
              ))}
            </section>
          ))}
          {loading && (
            <p className="trip-ai-loading" role="status">
              일정과 요청을 확인하고 있어요…
            </p>
          )}
          {error && (
            <p className="trip-ai-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <form
          className="trip-ai-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(draft);
          }}
        >
          <label className="trip-ai-sr-only" htmlFor="trip-ai-question">
            여행 도우미에게 질문하기
          </label>
          <div className="trip-ai-input-row">
            <textarea
              id="trip-ai-question"
              ref={inputRef}
              rows={2}
              maxLength={1500}
              value={draft}
              disabled={loading}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="이날 동선에 맞는 식당을 추천해줘"
            />
            <button type="submit" className="trip-ai-primary" disabled={loading || !draft.trim()}>
              {loading ? "찾는 중" : "보내기"}
            </button>
          </div>
          <p className="trip-ai-privacy">질문과 여행 일정·내 장소가 OpenAI에 전달돼요. 변경 사항은 확인 후 적용돼요.</p>
        </form>
      </div>
    </div>,
    document.body,
  );
}
