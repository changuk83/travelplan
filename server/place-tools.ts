import type { Place } from "../app/domain/types";

const text = { type: "string" };
const nullable = { type: ["string", "null"] };
export const placeTools = [
  {
    name: "search_near_place",
    description:
      "일차의 경유지 주변 검색. 식당/점심/카페 추천에 우선 사용. anchorId는 경유지 ID, start, goal 또는 null. null이면 경유지들을 표본 검색. 자동차 경로 없이도 실행 가능.",
    properties: { dayId: text, query: text, anchorId: nullable },
  },
  {
    name: "search_saved_places",
    description:
      "전달받은 내 장소 목록을 이름·주소·분류로 검색한다. query는 빈 문자열이면 전체, category는 정확한 카테고리 이름 또는 null. 검색 API 호출 없음.",
    properties: { dayId: text, query: text, category: nullable },
  },
].map(({ properties, ...tool }) => ({
  ...tool,
  inputSchema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: tool.name !== "search_saved_places" },
}));

export function searchIntent(query: string) {
  const rest = /휴게소/.test(query) && !/카페|커피|식당|주유소|충전/.test(query);
  const meal = !rest && /식당|맛집|점심|저녁|아침|음식점/.test(query);
  // Normalize generic conversational phrases, but retain specific menus/regions.
  const genericMeal =
    /^(?:점심|저녁|아침)?\s*(?:먹을\s*만한\s*)?(?:식당|맛집|음식점)?\s*(?:추천|검색)?(?:해줘|해\s*주세요)?$/.test(
      query.trim(),
    );
  return { rest, meal, query: rest ? "고속도로 휴게소" : meal && genericMeal ? "식당" : query.trim() };
}

export function matchesSearchIntent(place: Place, query: string) {
  const intent = searchIntent(query);
  if (intent.rest) return /고속도로휴게소/.test(place.category.replace(/\s/g, ""));
  if (intent.meal)
    return (
      /음식|식당|한식|중식|일식|양식|분식|레스토랑/.test(place.category) &&
      !/카페|커피|제과|베이커리|간식|술집|주점/.test(place.category)
    );
  return true;
}
