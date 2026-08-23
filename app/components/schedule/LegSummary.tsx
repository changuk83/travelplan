import type { RouteLeg } from "../../NaverMap";

export default function LegSummary({ leg }: { leg?: RouteLeg }) {
  if (!leg) return <span className="leg-summary loading">이전 장소에서 경로 계산 중…</span>;
  if (leg.distance === 0 && leg.duration === 0) return <span className="leg-summary">이전 장소와 같은 위치</span>;
  const km = leg.distance >= 10000 ? `${Math.round(leg.distance / 1000)}km` : `${(leg.distance / 1000).toFixed(1)}km`;
  const minutes = Math.max(1, Math.round(leg.duration / 60000));
  const time =
    minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60 ? `${minutes % 60}분` : ""}` : `${minutes}분`;
  return (
    <span className="leg-summary">
      이전 장소에서 · 자동차 · {km} · {time}
    </span>
  );
}
