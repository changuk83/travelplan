import type { AppTab } from "../../domain/types";

export default function AppHeader({ tab, onManageCategories }: { tab: AppTab; onManageCategories: () => void }) {
  return (
    <header className="app-header">
      <div>
        <p className="overline">자동차와 도보를 잇는 여행</p>
        <h1>길담</h1>
      </div>
      {tab === "saved" ? (
        <button className="category-manage-button" onClick={onManageCategories}>
          카테고리 관리
        </button>
      ) : null}
    </header>
  );
}
