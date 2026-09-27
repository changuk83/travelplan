"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { isReputationSummary, type ReputationSummary } from "../../domain/reputation";
import type { Place } from "../../domain/types";

export default function PlaceReputation({ place, apiBase }: { place: Place; apiBase: string }) {
  const [summary, setSummary] = useState<ReputationSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef<AbortController | null>(null);
  useEffect(() => () => flight.current?.abort(), []);
  async function show() {
    if (flight.current) return;
    if (summary) {
      setOpen((value) => !value);
      return;
    }
    const controller = new AbortController();
    flight.current = controller;
    setLoading(true);
    setOpen(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/api/ai/reputation`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: place.name, address: place.address }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 429 ? "요청이 많아요. 잠시 후 다시 시도해 주세요." : "후기 요약을 불러오지 못했어요.",
        );
      if (!isReputationSummary(data)) throw new Error("후기 응답을 확인하지 못했어요.");
      setSummary(data);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "후기 조회에 실패했어요.");
    } finally {
      flight.current = null;
      setLoading(false);
    }
  }
  let cursor = 0;
  const citedText = summary?.citations.map((citation, index) => {
    const preceding = summary.text.slice(cursor, citation.start);
    cursor = citation.end;
    return (
      <Fragment key={`${citation.url}-${index}`}>
        {preceding}
        <a href={citation.url} target="_blank" rel="noopener noreferrer" title={citation.title}>
          [{index + 1}] {citation.title}
        </a>
      </Fragment>
    );
  });
  return (
    <section className="trip-ai-reputation">
      <button type="button" disabled={loading} aria-expanded={open} onClick={show}>
        {loading
          ? "웹 후기 확인 중…"
          : summary && open
            ? "후기 요약 접기"
            : error
              ? "후기 요약 다시 보기"
              : "후기 요약 보기"}
      </button>
      {open && (
        <div aria-live="polite">
          {loading && <p>이름과 주소가 일치하는 장소의 후기를 찾고 있어요.</p>}
          {error && <p className="trip-ai-error">{error}</p>}
          {summary && (
            <>
              <h4>웹 후기 참고 요약</h4>
              <p className="trip-ai-reputation-text">
                {citedText}
                {summary.text.slice(cursor)}
              </p>
              <p className="trip-ai-address">
                조회일 {new Date(summary.checkedAt).toLocaleDateString("ko-KR")} · AI 요약
              </p>
              <p className="trip-ai-address">
                일부 공개 후기를 참고한 내용으로 전체 방문자의 평가를 대표하지 않아요. 협찬·게시 시점에 따라 차이가 있을
                수 있으니 원문도 확인해 주세요.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
