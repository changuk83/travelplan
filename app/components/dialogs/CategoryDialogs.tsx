"use client";

import { inferSavedCategory, placeCategories } from "../../domain/place";
import type { Place, SavedCategory } from "../../domain/types";

export function SaveCategoryDialog({
  place,
  categories,
  selectedCategories,
  onToggle,
  onAddCategory,
  onSave,
  onClose,
}: {
  place: Place;
  categories: SavedCategory[];
  selectedCategories: SavedCategory[];
  onToggle: (category: SavedCategory) => void;
  onAddCategory: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const recommended = inferSavedCategory(place);
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="app-dialog save-category-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-category-title"
      >
        <div className="dialog-title">
          <div>
            <span>{place.name}</span>
            <h2 id="save-category-title">카테고리를 선택하세요</h2>
          </div>
          <button onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <p className="category-recommendation">
          여러 개 선택할 수 있어요 · 추천 <strong>{recommended}</strong>
        </p>
        <div className="category-select-grid">
          {categories.map((category) => {
            const selected = selectedCategories.includes(category);
            return (
              <button
                key={category}
                className={`${selected ? "active " : ""}${recommended === category ? "recommended" : ""}`}
                aria-pressed={selected}
                onClick={() => onToggle(category)}
              >
                <i aria-hidden="true">{selected ? "✓" : ""}</i>
                <b>{category}</b>
                {recommended === category && <span>추천</span>}
              </button>
            );
          })}
        </div>
        <button className="add-category-from-save" onClick={onAddCategory}>
          ＋ 새 카테고리 만들기
        </button>
        <button className="dialog-primary" onClick={onSave} disabled={!selectedCategories.length}>
          {selectedCategories.length ? `${selectedCategories.length}개 카테고리에 저장` : "카테고리를 선택하세요"}
        </button>
      </section>
    </div>
  );
}

export function CategoryManagerDialog({
  categories,
  places,
  onRename,
  onDelete,
  onAdd,
  onClose,
}: {
  categories: SavedCategory[];
  places: Place[];
  onRename: (category: SavedCategory) => void;
  onDelete: (category: SavedCategory) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="app-dialog category-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-manager-title"
      >
        <div className="dialog-title">
          <div>
            <span>내 장소</span>
            <h2 id="category-manager-title">카테고리 관리</h2>
          </div>
          <button onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="category-manager-list">
          {categories.map((category) => (
            <div key={category}>
              <strong>{category}</strong>
              <span>{places.filter((place) => placeCategories(place).includes(category)).length}곳</span>
              <button onClick={() => onRename(category)}>이름 수정</button>
              <button className="danger" onClick={() => onDelete(category)} disabled={category === "기타"}>
                삭제
              </button>
            </div>
          ))}
        </div>
        <button className="dialog-primary" onClick={onAdd}>
          ＋ 새 카테고리
        </button>
      </section>
    </div>
  );
}

export function PlaceCategoryDialog({
  place,
  categories,
  onChange,
  onAddCategory,
  onClose,
}: {
  place: Place;
  categories: SavedCategory[];
  onChange: (categories: SavedCategory[]) => void;
  onAddCategory: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="app-dialog place-category-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-select-title"
      >
        <div className="dialog-title">
          <div>
            <span>{place.name}</span>
            <h2 id="category-select-title">카테고리 선택</h2>
          </div>
          <button onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <p className="category-recommendation">선택하면 바로 추가되고, 다시 누르면 삭제돼요.</p>
        <div className="category-choice-list">
          {categories.map((category) => {
            const current = placeCategories(place);
            const selected = current.includes(category);
            return (
              <button
                key={category}
                className={selected ? "active" : ""}
                aria-pressed={selected}
                onClick={() =>
                  onChange(selected ? current.filter((item) => item !== category) : [...current, category])
                }
              >
                <i aria-hidden="true">{selected ? "✓" : ""}</i>
                <strong>{category}</strong>
                <span>{selected ? "선택됨" : "선택"}</span>
              </button>
            );
          })}
        </div>
        <button className="add-category-from-place" onClick={onAddCategory}>
          ＋ 새 카테고리 만들기
        </button>
        <button className="dialog-primary" onClick={onClose}>
          완료
        </button>
      </section>
    </div>
  );
}
