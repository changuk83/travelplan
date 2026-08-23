import type { AppTab } from "../../domain/types";

export default function BottomNavigation({ tab, onChange }: { tab: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      <button className={tab === "plan" ? "active" : ""} onClick={() => onChange("plan")}>
        <span>⌂</span>일정
      </button>
      <button className={tab === "trips" ? "active" : ""} onClick={() => onChange("trips")}>
        <span>▣</span>여행
      </button>
      <button className={tab === "saved" ? "active" : ""} onClick={() => onChange("saved")}>
        <span>♡</span>내 장소
      </button>
    </nav>
  );
}
