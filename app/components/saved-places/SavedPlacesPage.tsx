import { placeCategories } from "../../domain/place";
import type { Place, SavedCategory } from "../../domain/types";
import SectionTitle from "../SectionTitle";

export default function SavedPlacesPage({
  places,
  filteredPlaces,
  categories,
  activeCategory,
  onCategoryChange,
  onAddCategory,
  onOpenSearch,
  onRemove,
  onRemoveCategory,
  onEditCategories,
  onEditMemo,
}: {
  places: Place[];
  filteredPlaces: Place[];
  categories: SavedCategory[];
  activeCategory: "전체" | SavedCategory;
  onCategoryChange: (category: "전체" | SavedCategory) => void;
  onAddCategory: () => void;
  onOpenSearch: () => void;
  onRemove: (place: Place) => void;
  onRemoveCategory: (place: Place, category: SavedCategory) => void;
  onEditCategories: (place: Place) => void;
  onEditMemo: (place: Place) => void;
}) {
  return (
    <section className="page saved-page">
      <SectionTitle
        title="내 장소"
        subtitle={`카테고리별로 모아보기 · ${places.length}곳`}
        action="＋ 장소 추가"
        onClick={onOpenSearch}
      />
      <div className="saved-category-tabs" role="tablist" aria-label="저장 장소 카테고리">
        {(["전체", ...categories] as const).map((category) => {
          const count =
            category === "전체"
              ? places.length
              : places.filter((place) => placeCategories(place).includes(category)).length;
          return (
            <button
              key={category}
              role="tab"
              aria-selected={activeCategory === category}
              className={activeCategory === category ? "active" : ""}
              onClick={() => onCategoryChange(category)}
            >
              {category} <span>{count}</span>
            </button>
          );
        })}
        <button className="add-category-tab" onClick={onAddCategory} aria-label="새 카테고리 추가">
          ＋
        </button>
      </div>
      <div className="saved-list">
        {filteredPlaces.length ? (
          filteredPlaces.map((place) => (
            <article className="rest-card saved-place-card" key={place.id}>
              <button
                className="remove-saved-place"
                onClick={() => onRemove(place)}
                aria-label={`${place.name} 내 장소에서 삭제`}
                title="내 장소에서 삭제"
              >
                ×
              </button>
              <div className="rest-symbol">♥</div>
              <div className="rest-copy">
                <div className="saved-place-title">
                  <h3>{place.name}</h3>
                </div>
                <p>{place.address}</p>
                <span>{place.category}</span>
                <div className="place-category-chips" aria-label={`${place.name} 카테고리`}>
                  {placeCategories(place).map((category) => (
                    <span key={category}>
                      {category}
                      <button
                        onClick={() => onRemoveCategory(place, category)}
                        aria-label={`${place.name}에서 ${category} 카테고리 삭제`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button className="place-category-add" onClick={() => onEditCategories(place)}>
                    ＋ 카테고리
                  </button>
                  <button
                    className={`place-memo-icon ${place.memo ? "has-memo" : ""}`}
                    onClick={() => onEditMemo(place)}
                    aria-label={`${place.name} ${place.memo ? "메모 수정" : "메모 추가"}`}
                    title={place.memo ? "메모 수정" : "메모 추가"}
                  >
                    <span aria-hidden="true" />
                  </button>
                </div>
                {place.memo && <p className="place-memo">메모 · {place.memo}</p>}
              </div>
            </article>
          ))
        ) : (
          <div className="saved-empty">
            <strong>
              {places.length ? `${activeCategory} 카테고리에 저장한 장소가 없어요` : "아직 저장한 장소가 없어요"}
            </strong>
            <p>
              {places.length
                ? "다른 카테고리를 선택하거나 장소의 분류를 변경해 보세요."
                : "지도에서 장소를 검색한 뒤 ♡ 저장을 눌러보세요."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
