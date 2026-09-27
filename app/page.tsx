"use client";

import { withScheduleTime, transferScheduleTime } from "./domain/place";
import { useEffect, useMemo, useRef, useState } from "react";
import NaverMap, { type RouteCacheScope, type RouteLeg } from "./NaverMap";
import DateRangePicker from "./components/DateRangePicker";
import { CategoryManagerDialog, PlaceCategoryDialog, SaveCategoryDialog } from "./components/dialogs/CategoryDialogs";
import SectionTitle from "./components/SectionTitle";
import AppHeader from "./components/layout/AppHeader";
import BottomNavigation from "./components/layout/BottomNavigation";
import DaySwipePreview from "./components/schedule/DaySwipePreview";
import DaySwitcher from "./components/schedule/DaySwitcher";
import ScheduleTimeline from "./components/schedule/ScheduleTimeline";
import SavedPlacesPage from "./components/saved-places/SavedPlacesPage";
import SavedPlaceSearchOverlay from "./components/search/SavedPlaceSearchOverlay";
import PlaceSearchPage from "./components/search/PlaceSearchPage";
import TripList from "./components/trip/TripList";
import TripHeader from "./components/trip/TripHeader";
import { comparableDate, dateInputValue, isoDate, nextDateLabel, nextIsoDate } from "./domain/date";
import { addPlaceCategory, inferSavedCategory, placeCategories } from "./domain/place";
import type {
  AppTab,
  DayPlan,
  Place,
  RouteEndpoint,
  SavedCategory,
  TextEditor,
  TripCreator,
  TripPlan,
} from "./domain/types";
import { usePlaceSearch } from "./hooks/usePlaceSearch";
import { useSavedPlaces } from "./hooks/useSavedPlaces";
import { useCloudSync } from "./hooks/useCloudSync";
import { useTrips } from "./hooks/useTrips";
import { useDaySwipe } from "./hooks/useDaySwipe";
import { useScheduleDrag } from "./hooks/useScheduleDrag";
import TripAssistant from "./components/ai/TripAssistant";
import type { AiRecommendation } from "./domain/ai";
import { applyScheduleCommand } from "./domain/schedule-service";
import type { ScheduleAction, ScheduleCommand } from "./domain/schedule";
import { initialTrips } from "./domain/trip";

export type { Place, RouteEndpoint } from "./domain/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const AI_API_BASE = process.env.NODE_ENV === "development" ? "" : API_BASE;
const CURRENT_USER_ID = 1;

export default function Home() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [tab, setTab] = useState<AppTab>("plan");
  const [savedSearchOpen, setSavedSearchOpen] = useState(false);
  const { trips, setTrips, activeTripId, setActiveTripId, tripsLoaded, days, setDays, activeDayId, setActiveDayId } =
    useTrips();
  const { savedPlaces, setSavedPlaces, savedCategories, setSavedCategories, savedLoaded } = useSavedPlaces();
  const SAVED_CATEGORIES = savedCategories;
  const [savedCategory, setSavedCategory] = useState<"전체" | SavedCategory>("전체");
  const [routeSavedCategory, setRouteSavedCategory] = useState<"전체" | SavedCategory>("전체");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoryPlace, setCategoryPlace] = useState<Place | null>(null);
  const [pendingSavePlace, setPendingSavePlace] = useState<Place | null>(null);
  const [pendingSaveCategories, setPendingSaveCategories] = useState<SavedCategory[]>([]);
  const [editor, setEditor] = useState<TextEditor | null>(null);
  const [tripCreator, setTripCreator] = useState<TripCreator | null>(null);
  const [dateEditor, setDateEditor] = useState<{ dayId: string; value: string } | null>(null);
  const [editorError, setEditorError] = useState("");
  const [candidatePreviews, setCandidatePreviews] = useState<Record<string, string>>({});
  const [mapPinned, setMapPinned] = useState(false);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [candidateFor, setCandidateFor] = useState<string | null>(null);
  const [endpointTarget, setEndpointTarget] = useState<"start" | "goal" | null>(null);
  const [legs, setLegs] = useState<RouteLeg[]>([]);
  const savedPlacesRef = useRef<HTMLDivElement>(null);
  const activeDay = days.find((day) => day.id === activeDayId) ?? days[0];
  const activeDayIndex = days.findIndex((day) => day.id === activeDayId);
  const previousDay = activeDayIndex > 0 ? days[activeDayIndex - 1] : null;
  const nextDay = activeDayIndex >= 0 && activeDayIndex < days.length - 1 ? days[activeDayIndex + 1] : null;
  const activeTrip = trips.find((trip) => trip.id === activeTripId) ?? trips[0] ?? initialTrips[0];
  const places = useMemo(() => activeDay?.places ?? [], [activeDay]);
  const mapPlaces = useMemo(
    () =>
      places.map(
        (place) =>
          activeDay.candidates?.[place.id]?.find((candidate) => candidate.id === candidatePreviews[place.id]) ?? place,
      ),
    [places, activeDay.candidates, candidatePreviews],
  );
  const routeCacheScope = useMemo<RouteCacheScope>(
    () => ({
      userId: CURRENT_USER_ID,
      tripId: activeTripId,
      dayId: activeDayId,
      mode: Object.keys(candidatePreviews).length ? "preview" : "schedule",
    }),
    [activeTripId, activeDayId, candidatePreviews],
  );
  const searchPreviousPlace = useMemo(() => {
    if (insertIndex !== null) return insertIndex === 0 ? activeDay.start : (places[insertIndex - 1] ?? activeDay.start);
    if (candidateFor !== null) {
      const index = places.findIndex((place) => place.id === candidateFor);
      return index <= 0 ? activeDay.start : places[index - 1];
    }
    if (endpointTarget === "goal") return places.at(-1) ?? activeDay.start;
    return null;
  }, [insertIndex, candidateFor, endpointTarget, activeDay.start, places]);
  const searchNextPlace = useMemo(() => {
    if (insertIndex !== null)
      return insertIndex === places.length ? activeDay.goal : (places[insertIndex] ?? activeDay.goal);
    if (candidateFor !== null) {
      const index = places.findIndex((place) => place.id === candidateFor);
      return index < 0 || index === places.length - 1 ? activeDay.goal : places[index + 1];
    }
    if (endpointTarget === "start") return places[0] ?? activeDay.goal;
    return null;
  }, [insertIndex, candidateFor, endpointTarget, activeDay.goal, places]);
  const searchCandidateMain = useMemo(
    () => (candidateFor ? (places.find((place) => place.id === candidateFor) ?? null) : null),
    [candidateFor, places],
  );
  const { query, setQuery, results, setResults, searching, searchError, setSearchError, source, search, autocomplete } =
    usePlaceSearch({
      apiBase: API_BASE,
      previousPlace: searchPreviousPlace,
      nextPlace: searchNextPlace,
      candidateMain: searchCandidateMain,
    });
  const choosingPlace = insertIndex !== null || candidateFor !== null || endpointTarget !== null;
  const insertionFrom =
    insertIndex === null
      ? ""
      : `${activeDay.label} · ${insertIndex === 0 ? activeDay.start.name : places[insertIndex - 1]?.name}`;
  const insertionTo =
    insertIndex === null
      ? ""
      : `( 추가할 장소 ) → ${insertIndex === places.length ? activeDay.goal.name : places[insertIndex]?.name}`;
  const filteredSavedPlaces =
    savedCategory === "전체"
      ? savedPlaces
      : savedPlaces.filter((place) => placeCategories(place).includes(savedCategory));
  const routeSavedPlaces =
    routeSavedCategory === "전체"
      ? savedPlaces
      : savedPlaces.filter((place) => placeCategories(place).includes(routeSavedCategory));
  const displayedTrips = useMemo(() => {
    const today = isoDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const closest = [...trips]
      .filter((trip) => {
        const start = comparableDate(trip.days[0]);
        return Boolean(start && start > today);
      })
      .sort((a, b) => (comparableDate(a.days[0]) ?? "").localeCompare(comparableDate(b.days[0]) ?? ""))[0];
    return closest ? [closest, ...trips.filter((trip) => trip.id !== closest.id)] : trips;
  }, [trips]);
  const cloudSync = useCloudSync({
    apiBase: API_BASE,
    tripsLoaded,
    savedLoaded,
    trips,
    savedPlaces,
    savedCategories,
    setTrips,
    setActiveTripId,
    setActiveDayId,
    setSavedPlaces,
    setSavedCategories,
  });
  const {
    offset: daySwipeOffset,
    animating: daySwipeAnimating,
    begin: beginDaySwipe,
    move: moveDaySwipe,
    end: endDaySwipe,
    cancel: cancelDaySwipe,
  } = useDaySwipe({ days, activeDayId, onSelectDay: selectDay });
  const { dragIndex, beginDrag, continueDrag, endDrag } = useScheduleDrag({ places, setPlaces });

  useEffect(() => {
    document.documentElement.classList.toggle("inserting-place", insertIndex !== null);
    return () => document.documentElement.classList.remove("inserting-place");
  }, [insertIndex]);
  useEffect(() => {
    const root = document.documentElement;
    if (insertIndex === null) {
      root.style.removeProperty("--insertion-from");
      root.style.removeProperty("--insertion-to");
      root.style.removeProperty("--insertion-day");
      return;
    }
    const from = insertIndex === 0 ? activeDay.start.name : (places[insertIndex - 1]?.name ?? "이전 장소");
    const to = insertIndex === places.length ? activeDay.goal.name : (places[insertIndex]?.name ?? "다음 장소");
    root.style.setProperty("--insertion-from", JSON.stringify(from));
    root.style.setProperty("--insertion-to", JSON.stringify(to));
    root.style.setProperty("--insertion-day", JSON.stringify(`${activeDay.label} · 장소 추가`));
    return () => {
      root.style.removeProperty("--insertion-from");
      root.style.removeProperty("--insertion-to");
      root.style.removeProperty("--insertion-day");
    };
  }, [insertIndex, activeDay, places]);
  useEffect(() => {
    document.documentElement.classList.toggle("saved-searching", savedSearchOpen);
    return () => document.documentElement.classList.remove("saved-searching");
  }, [savedSearchOpen]);
  useEffect(() => {
    document.documentElement.classList.toggle("map-pinned", mapPinned);
    return () => document.documentElement.classList.remove("map-pinned");
  }, [mapPinned]);
  useEffect(() => {
    if (tab !== "map" || !choosingPlace) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.querySelector<HTMLInputElement>(".map-page .place-search input")?.focus({ preventScroll: true });
    });
  }, [tab, choosingPlace]);
  useEffect(() => {
    if (!savedSearchOpen) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.querySelector<HTMLElement>(".saved-page")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.querySelector<HTMLInputElement>(".saved-inline-search input")?.focus({ preventScroll: true });
    });
  }, [savedSearchOpen]);

  function setPlaces(update: Place[] | ((items: Place[]) => Place[])) {
    setDays((items) =>
      items.map((day) =>
        day.id === activeDayId ? { ...day, places: typeof update === "function" ? update(day.places) : update } : day,
      ),
    );
  }
  function closeSavedSearch() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setSavedSearchOpen(false);
    setResults([]);
    setSearchError("");
    setQuery("");
  }

  function dismissPlaceSearchResults() {
    setResults([]);
    setSearchError("");
  }

  function changeTab(nextTab: AppTab) {
    if (nextTab !== "saved" && savedSearchOpen) closeSavedSearch();
    setTab(nextTab);
  }
  function selectDay(id: string) {
    setActiveDayId(id);
    setLegs([]);
    setCandidatePreviews({});
    setInsertIndex(null);
    setCandidateFor(null);
    setEndpointTarget(null);
    setResults([]);
    setSearchError("");
  }
  function previewCandidate(mainId: string, place?: Place) {
    setCandidatePreviews((items) => {
      if (!place) {
        const next = { ...items };
        delete next[mainId];
        return next;
      }
      return { ...items, [mainId]: place.id };
    });
    setLegs([]);
  }
  function saveDayDate() {
    if (!dateEditor) return;
    const targetIndex = days.findIndex((day) => day.id === dateEditor.dayId);
    if (targetIndex < 0) return;
    const start = new Date(`${dateEditor.value}T00:00:00`);
    setDays((items) =>
      items.map((day, index) => {
        if (index < targetIndex) return day;
        const next = new Date(start);
        next.setDate(start.getDate() + index - targetIndex);
        return {
          ...day,
          date: `${next.getMonth() + 1}월 ${next.getDate()}일`,
          dateValue: isoDate(next.getFullYear(), next.getMonth(), next.getDate()),
        };
      }),
    );
    setDateEditor(null);
  }
  function addDay() {
    const previous = days[days.length - 1];
    if (previous.goal.name === "목적지 미정") {
      window.alert(`${previous.label} 목적지를 먼저 설정해 주세요.`);
      setActiveDayId(previous.id);
      return;
    }
    const id = `day-${Date.now()}`;
    const next: DayPlan = {
      id,
      label: `${days.length + 1}일차`,
      date: nextDateLabel(previous.date),
      dateValue: nextIsoDate(previous.dateValue),
      start: previous.goal,
      goal: { name: "목적지 미정", longitude: previous.goal.longitude, latitude: previous.goal.latitude },
      places: [],
    };
    setDays((items) => [...items, next]);
    setActiveDayId(id);
    setLegs([]);
  }
  function removeDay(id: string) {
    if (days.length <= 1) return;
    const target = days.find((day) => day.id === id);
    if (!target || !window.confirm(`${target.label}(${target.date}) 일정과 장소를 모두 삭제할까요?`)) return;
    const index = days.findIndex((day) => day.id === id);
    const remaining = days.filter((day) => day.id !== id).map((day, i) => ({ ...day, label: `${i + 1}일차` }));
    setDays(remaining);
    if (id === activeDayId) setActiveDayId(remaining[Math.max(0, index - 1)]?.id ?? remaining[0].id);
    setLegs([]);
  }
  function openTrip(id: string) {
    const trip = trips.find((item) => item.id === id);
    if (!trip) return;
    setActiveTripId(id);
    setActiveDayId(trip.days[0].id);
    setLegs([]);
    setTab("plan");
  }
  function addTrip() {
    setTripCreator({ title: "", startDate: "", endDate: "", error: "" });
  }
  function createTrip() {
    if (!tripCreator) return;
    const title = tripCreator.title.trim();
    if (!title) {
      setTripCreator({ ...tripCreator, error: "여행 이름을 입력해 주세요." });
      return;
    }
    const firstDate = tripCreator.startDate || tripCreator.endDate;
    let dayCount = 1;
    if (tripCreator.startDate && tripCreator.endDate) {
      const start = new Date(`${tripCreator.startDate}T00:00:00`);
      const end = new Date(`${tripCreator.endDate}T00:00:00`);
      dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
      if (dayCount < 1) {
        setTripCreator({ ...tripCreator, error: "종료일은 시작일보다 빠를 수 없어요." });
        return;
      }
    }
    const timestamp = Date.now();
    const tripDays: DayPlan[] = Array.from({ length: dayCount }, (_, index) => {
      let date = "날짜 미정";
      let dateValue: undefined | string;
      if (firstDate) {
        const value = new Date(`${firstDate}T00:00:00`);
        value.setDate(value.getDate() + index);
        date = `${value.getMonth() + 1}월 ${value.getDate()}일`;
        dateValue = isoDate(value.getFullYear(), value.getMonth(), value.getDate());
      }
      return {
        id: `day-${timestamp}-${index + 1}`,
        label: `${index + 1}일차`,
        date,
        dateValue,
        start: { name: "출발지 미정", longitude: 127.5, latitude: 36.5 },
        goal: { name: "목적지 미정", longitude: 127.5, latitude: 36.5 },
        places: [],
      };
    });
    const trip: TripPlan = { id: `trip-${timestamp}`, title, days: tripDays, updatedAt: timestamp };
    setSavedCategories((items) => (items.includes(title) ? items : [...items, title]));
    setTrips((items) => [trip, ...items]);
    setActiveTripId(trip.id);
    setActiveDayId(trip.days[0].id);
    setLegs([]);
    setTripCreator(null);
    setTab("plan");
  }
  function renameTrip(id: string) {
    const trip = trips.find((item) => item.id === id);
    if (trip) {
      setEditorError("");
      setEditor({ kind: "trip", title: "여행 이름 변경", value: trip.title, tripId: id });
    }
  }
  function removeTrip(id: string) {
    if (trips.length <= 1) return;
    const trip = trips.find((item) => item.id === id);
    if (!trip || !window.confirm(`‘${trip.title}’ 여행을 삭제할까요?`)) return;
    const remaining = trips.filter((item) => item.id !== id);
    setTrips(remaining);
    if (id === activeTripId) {
      const next = remaining[0];
      setActiveTripId(next.id);
      setActiveDayId(next.days[0].id);
      setLegs([]);
    }
  }

  function saveForActiveTrip(place: Place) {
    const categorized = addPlaceCategory(place, activeTrip.title);
    setSavedCategories((items) => (items.includes(activeTrip.title) ? items : [...items, activeTrip.title]));
    setSavedPlaces((items) => {
      const existing = items.find((item) => item.id === place.id);
      return existing
        ? items.map((item) => (item.id === place.id ? addPlaceCategory(item, activeTrip.title) : item))
        : [categorized, ...items];
    });
    return categorized;
  }
  function addPlace(place: Place, scheduledTime?: string) {
    const error = applyLocalCommand({
      kind: "add_place",
      tripId: activeTrip.id,
      dayId: activeDayId,
      place,
      insertIndex: insertIndex ?? places.length,
      scheduledTime,
    });
    if (error) {
      setSearchError(error);
      return;
    }
    setResults([]);
    setQuery("");
    if (insertIndex !== null) {
      setInsertIndex(null);
      setTab("plan");
    }
  }
  function addAiPlace(recommendation: AiRecommendation): string | null {
    const error = applyLocalCommand({
      kind: "add_place",
      tripId: activeTrip.id,
      dayId: recommendation.dayId,
      place: recommendation.place,
      insertIndex: recommendation.insertIndex,
      scheduledTime: recommendation.scheduledTime,
    });
    if (error) return error;
    setActiveDayId(recommendation.dayId);
    setCandidatePreviews({});
    return null;
  }
  function applyLocalCommand(command: ScheduleCommand): string | null {
    const result = applyScheduleCommand({ trips, savedPlaces, savedCategories }, command);
    if (result.error) return result.error;
    setTrips(result.state.trips);
    setSavedPlaces(result.state.savedPlaces);
    setSavedCategories(result.state.savedCategories);
    return null;
  }
  async function applyAiAction(action: ScheduleAction): Promise<string | null> {
    const error = await cloudSync.applyCommand(action);
    if (!error) {
      setActiveTripId(action.command.tripId);
      setActiveDayId(action.command.kind === "move_place" ? action.command.toDayId : action.command.dayId);
      setCandidatePreviews({});
      setLegs([]);
    }
    return error;
  }
  function saveAiPlace(place: Place): string | null {
    if (savedPlaces.some((item) => item.id === place.id)) return "이미 내 장소에 저장되어 있어요.";
    saveForActiveTrip(place);
    return null;
  }
  function defaultRouteSavedCategory() {
    setRouteSavedCategory(savedCategories.includes(activeTrip.title) ? activeTrip.title : "전체");
  }
  function chooseInsertion(index: number) {
    defaultRouteSavedCategory();
    setInsertIndex(index);
    setCandidateFor(null);
    setEndpointTarget(null);
    setResults([]);
    setSearchError("");
    setQuery("");
    setTab("map");
  }
  function chooseCandidate(id: string) {
    defaultRouteSavedCategory();
    setCandidateFor(id);
    setInsertIndex(null);
    setEndpointTarget(null);
    setResults([]);
    setSearchError("");
    setQuery("");
    setTab("map");
  }
  function chooseEndpoint(target: "start" | "goal") {
    defaultRouteSavedCategory();
    setEndpointTarget(target);
    setCandidateFor(null);
    setInsertIndex(null);
    setResults([]);
    setSearchError("");
    setQuery("");
    setTab("map");
  }
  function setEndpoint(place: Place, scheduledTime?: string) {
    if (!endpointTarget) return;
    saveForActiveTrip(place);
    const target = endpointTarget;
    const endpoint: RouteEndpoint = { name: place.name, longitude: place.longitude, latitude: place.latitude };
    setDays((items) => {
      const activeIndex = items.findIndex((day) => day.id === activeDayId);
      return items.map((day, index) =>
        index === activeIndex
          ? scheduledTime
            ? withScheduleTime({ ...day, [target]: endpoint }, target, scheduledTime)
            : { ...day, [target]: endpoint }
          : target === "goal" && index === activeIndex + 1
            ? { ...day, start: endpoint }
            : day,
      );
    });
    setEndpointTarget(null);
    setResults([]);
    setQuery("");
    setLegs([]);
    setTab("plan");
  }
  function addCandidate(place: Place) {
    if (!candidateFor) return;
    const error = applyLocalCommand({
      kind: "add_candidate",
      tripId: activeTrip.id,
      dayId: activeDayId,
      placeId: candidateFor,
      candidate: place,
    });
    if (error) {
      setSearchError(error);
      return;
    }
    setCandidateFor(null);
    setResults([]);
    setQuery("");
    setTab("plan");
  }
  function removeCandidate(mainId: string, id: string) {
    setDays((items) =>
      items.map((day) =>
        day.id === activeDayId
          ? {
              ...day,
              candidates: {
                ...(day.candidates ?? {}),
                [mainId]: (day.candidates?.[mainId] ?? []).filter((item) => item.id !== id),
              },
            }
          : day,
      ),
    );
  }
  function promoteCandidate(mainId: string, id: string) {
    const promotedPlace = activeDay.candidates?.[mainId]?.find((item) => item.id === id);
    if (promotedPlace) saveForActiveTrip(promotedPlace);
    setDays((items) =>
      items.map((day) => {
        if (day.id !== activeDayId) return day;
        const index = day.places.findIndex((item) => item.id === mainId);
        const alternatives = day.candidates?.[mainId] ?? [];
        const promoted = alternatives.find((item) => item.id === id);
        if (index < 0 || !promoted) return day;
        const nextPlaces = [...day.places];
        const oldMain = nextPlaces[index];
        nextPlaces[index] = addPlaceCategory(promoted, activeTrip.title);
        const candidates = { ...(day.candidates ?? {}) };
        delete candidates[mainId];
        candidates[promoted.id] = [oldMain, ...alternatives.filter((item) => item.id !== id)];
        return transferScheduleTime({ ...day, places: nextPlaces, candidates }, mainId, promoted.id);
      }),
    );
    setLegs([]);
  }
  function toggleSaved(place: Place) {
    const exists = savedPlaces.some((item) => item.id === place.id);
    if (savedSearchOpen) {
      if (exists) return;
      setSavedPlaces((items) => [
        { ...place, savedCategories: placeCategories(place), savedCategory: undefined },
        ...items,
      ]);
      return;
    }
    setSavedPlaces((items) =>
      exists
        ? items.filter((item) => item.id !== place.id)
        : [{ ...place, savedCategories: placeCategories(place), savedCategory: undefined }, ...items],
    );
  }
  function removeSavedPlace(place: Place) {
    if (
      !window.confirm(
        `‘${place.name}’을(를) 내 장소에서 삭제할까요?\n기존 여행 일정에 추가된 장소는 그대로 유지됩니다.`,
      )
    )
      return;
    setSavedPlaces((items) => items.filter((item) => item.id !== place.id));
    setCategoryPlace((current) => (current?.id === place.id ? null : current));
  }
  function openSaveCategoryPicker(place: Place) {
    const recommended = inferSavedCategory(place);
    setPendingSavePlace(place);
    setPendingSaveCategories([savedCategories.includes(recommended) ? recommended : "기타"]);
  }
  function closeSaveCategoryPicker() {
    setPendingSavePlace(null);
    setPendingSaveCategories([]);
  }
  function togglePendingSaveCategory(category: SavedCategory) {
    setPendingSaveCategories((items) =>
      items.includes(category) ? items.filter((item) => item !== category) : [...items, category],
    );
  }
  function savePlaceInCategories(place: Place) {
    if (!pendingSaveCategories.length) return;
    if (!savedPlaces.some((item) => item.id === place.id))
      setSavedPlaces((items) => [
        { ...place, savedCategories: [...new Set(pendingSaveCategories)], savedCategory: undefined },
        ...items,
      ]);
    closeSavedSearch();
    closeSaveCategoryPicker();
  }
  function editSavedCategory(place: Place) {
    setCategoryPlace(place);
  }
  function updatePlaceCategories(place: Place, categories: SavedCategory[]) {
    const normalized = [...new Set(categories.length ? categories : ["기타"])];
    const updated = { ...place, savedCategories: normalized, savedCategory: undefined };
    setSavedPlaces((items) => items.map((item) => (item.id === place.id ? updated : item)));
    setCategoryPlace((current) => (current?.id === place.id ? updated : current));
  }
  function removePlaceCategory(place: Place, category: SavedCategory) {
    updatePlaceCategories(
      place,
      placeCategories(place).filter((item) => item !== category),
    );
  }
  function addSavedCategory() {
    setEditorError("");
    setEditor({ kind: "category-add", title: "새 카테고리 추가", value: "" });
  }
  function renameSavedCategory(category: string) {
    setEditorError("");
    setEditor({ kind: "category-rename", title: "카테고리 이름 수정", value: category, category });
  }
  function deleteSavedCategory(category: string) {
    if (category === "기타") {
      window.alert("‘기타’ 카테고리는 삭제할 수 없어요.");
      return;
    }
    if (!window.confirm(`‘${category}’ 카테고리를 삭제할까요?\n이 카테고리만 가진 장소는 ‘기타’로 이동합니다.`)) return;
    setSavedCategories((items) => items.filter((item) => item !== category));
    setSavedPlaces((items) =>
      items.map((place) => {
        const remaining = placeCategories(place).filter((item) => item !== category);
        return { ...place, savedCategories: remaining.length ? remaining : ["기타"], savedCategory: undefined };
      }),
    );
    setSavedCategory("전체");
  }
  function manageSavedCategories() {
    setCategoryManagerOpen(true);
  }
  function editMemo(place: Place) {
    setEditorError("");
    setEditor({ kind: "memo", title: `${place.name} 메모`, value: place.memo ?? "", place });
  }
  function submitEditor() {
    if (!editor) return;
    const value = editor.value.trim();
    if (editor.kind !== "memo" && !value) {
      setEditorError("내용을 입력해 주세요.");
      return;
    }
    if (
      (editor.kind === "category-add" || editor.kind === "category-rename") &&
      (value.length > 40 || savedCategories.some((item) => item === value && item !== editor.category))
    ) {
      setEditorError("40자 이내의 중복되지 않은 이름을 입력해 주세요.");
      return;
    }
    if (editor.kind === "trip" && editor.tripId) {
      const oldTitle = trips.find((item) => item.id === editor.tripId)?.title;
      setTrips((items) =>
        items.map((item) => (item.id === editor.tripId ? { ...item, title: value, updatedAt: Date.now() } : item)),
      );
      if (oldTitle && oldTitle !== value) {
        setSavedCategories((items) => [...new Set(items.map((item) => (item === oldTitle ? value : item)))]);
        setSavedPlaces((items) =>
          items.map((place) => ({
            ...place,
            savedCategories: [...new Set(placeCategories(place).map((item) => (item === oldTitle ? value : item)))],
            savedCategory: undefined,
          })),
        );
      }
    }
    if (editor.kind === "memo" && editor.place) {
      const update = (item: Place) => (item.id === editor.place!.id ? { ...item, memo: value } : item);
      setDays((items) =>
        items.map((day) => ({
          ...day,
          places: day.places.map(update),
          candidates: day.candidates
            ? Object.fromEntries(Object.entries(day.candidates).map(([id, list]) => [id, list.map(update)]))
            : day.candidates,
        })),
      );
      setSavedPlaces((items) => items.map(update));
    }
    if (editor.kind === "category-add") {
      setSavedCategories((items) => [...items, value]);
      setSavedCategory(value);
    }
    if (editor.kind === "category-rename" && editor.category && value !== editor.category) {
      setSavedCategories((items) => items.map((item) => (item === editor.category ? value : item)));
      setSavedPlaces((items) =>
        items.map((place) => ({
          ...place,
          savedCategories: [
            ...new Set(placeCategories(place).map((item) => (item === editor.category ? value : item))),
          ],
          savedCategory: undefined,
        })),
      );
      setSavedCategory((current) => (current === editor.category ? value : current));
    }
    setEditor(null);
    setEditorError("");
  }
  function removePlace(id: string) {
    const error = applyLocalCommand({ kind: "remove_place", tripId: activeTrip.id, dayId: activeDayId, placeId: id });
    if (error) {
      window.alert(error);
      return;
    }
    setCandidatePreviews((items) => {
      const next = { ...items };
      delete next[id];
      return next;
    });
    setLegs([]);
  }

  return (
    <main className="app-shell">
      <AppHeader tab={tab} onManageCategories={manageSavedCategories} />
      {cloudSync.syncError && (
        <div className="cloud-sync-notice" role="status">
          <p>{cloudSync.syncError}</p>
          <div>
            {cloudSync.syncStatus !== "conflict" && (
              <button
                type="button"
                onClick={() =>
                  void cloudSync
                    .flushPending()
                    .catch((error: unknown) =>
                      window.alert(error instanceof Error ? error.message : "저장하지 못했어요."),
                    )
                }
              >
                저장 재시도
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (
                  !window.confirm(
                    "이 기기에만 남은 수정 대신 서버의 최신 일정을 불러올까요? 현재 내용은 백업으로 보관합니다.",
                  )
                )
                  return;
                localStorage.setItem(
                  "gildam-sync-draft-backup",
                  JSON.stringify({ trips, savedPlaces, savedCategories, savedAt: Date.now() }),
                );
                void cloudSync
                  .reloadCloud({ discardLocal: true })
                  .catch((error: unknown) =>
                    window.alert(error instanceof Error ? error.message : "불러오지 못했어요."),
                  );
              }}
            >
              서버 일정 불러오기
            </button>
          </div>
        </div>
      )}
      {tab === "plan" && trips.length > 0 && (
        <section
          className={`page plan-page ${daySwipeAnimating ? "swipe-settling" : daySwipeOffset ? "swipe-dragging" : ""}`}
          style={
            daySwipeAnimating || daySwipeOffset ? { transform: `translate3d(${daySwipeOffset}px,0,0)` } : undefined
          }
          onTouchStart={beginDaySwipe}
          onTouchMove={moveDaySwipe}
          onTouchEnd={endDaySwipe}
          onTouchCancel={cancelDaySwipe}
        >
          {previousDay && (
            <DaySwipePreview
              day={previousDay}
              direction="previous"
              tripTitle={activeTrip.title}
              tripRange={`${days[0]?.date}–${days[days.length - 1]?.date} · ${days.length}일 여행`}
            />
          )}
          {nextDay && (
            <DaySwipePreview
              day={nextDay}
              direction="next"
              tripTitle={activeTrip.title}
              tripRange={`${days[0]?.date}–${days[days.length - 1]?.date} · ${days.length}일 여행`}
            />
          )}
          <TripHeader
            trip={activeTrip}
            days={days}
            activeDay={activeDay}
            syncLabel={
              cloudSync.syncError
                ? "기기에 보관 중"
                : cloudSync.syncStatus === "saving"
                  ? "서버 저장 중"
                  : cloudSync.syncStatus === "loading"
                    ? "불러오는 중"
                    : API_BASE
                      ? "자동 저장"
                      : "기기에 자동 저장"
            }
          />
          <DaySwitcher
            days={days}
            activeDayId={activeDayId}
            onSelect={selectDay}
            onAdd={addDay}
            onEditDate={(day) => setDateEditor({ dayId: day.id, value: dateInputValue(day.date) })}
            onRemove={removeDay}
          />
          <div className="map-pin-row">
            <button type="button" className="ai-assistant-launch" onClick={() => setAssistantOpen(true)}>
              AI에게 부탁하기
            </button>
            <button
              type="button"
              className={mapPinned ? "active" : ""}
              aria-pressed={mapPinned}
              onClick={() => setMapPinned((value) => !value)}
            >
              <i aria-hidden="true">⌖</i>
              {mapPinned ? "지도 고정 해제" : "스크롤할 때 지도 고정"}
            </button>
          </div>
          <div className={`plan-map ${mapPinned ? "pinned" : ""}`}>
            <NaverMap
              places={mapPlaces}
              start={activeDay.start}
              goal={activeDay.goal}
              onRouteData={setLegs}
              cacheScope={routeCacheScope}
            />
          </div>
          <SectionTitle title={`${activeDay.label} 일정`} subtitle="각 구간의 실시간 자동차 거리와 예상 시간이에요" />
          <ScheduleTimeline
            day={activeDay}
            onTimeChange={(key, time) =>
              setDays((items) => items.map((day) => (day.id === activeDayId ? withScheduleTime(day, key, time) : day)))
            }
            legs={legs}
            dragIndex={dragIndex}
            onChooseEndpoint={chooseEndpoint}
            onChooseInsertion={chooseInsertion}
            onBeginDrag={beginDrag}
            onContinueDrag={continueDrag}
            onEndDrag={endDrag}
            onRemove={removePlace}
            onEditMemo={editMemo}
            onAddCandidate={chooseCandidate}
            onRemoveCandidate={removeCandidate}
            onPromoteCandidate={promoteCandidate}
            onPreviewCandidate={previewCandidate}
          />
        </section>
      )}
      {assistantOpen && (
        <TripAssistant
          key={activeTrip.id}
          trip={activeTrip}
          trips={trips}
          savedPlaces={savedPlaces}
          activeDayId={activeDayId}
          apiBase={AI_API_BASE}
          onClose={() => setAssistantOpen(false)}
          onAdd={addAiPlace}
          onSave={saveAiPlace}
          onApply={applyAiAction}
        />
      )}
      {tab === "map" && (
        <PlaceSearchPage
          autocomplete={autocomplete}
          key={`${activeDayId}:${endpointTarget}:${candidateFor}:${insertIndex}`}
          places={places}
          start={activeDay.start}
          goal={activeDay.goal}
          query={query}
          searching={searching}
          results={results}
          error={searchError}
          source={source}
          choosingPlace={choosingPlace}
          endpointTarget={endpointTarget}
          candidateFor={candidateFor}
          insertIndex={insertIndex}
          insertionFrom={insertionFrom}
          insertionTo={insertionTo}
          previousPlace={searchPreviousPlace}
          savedPlaces={savedPlaces}
          savedCategories={SAVED_CATEGORIES}
          savedCategory={routeSavedCategory}
          filteredSavedPlaces={routeSavedPlaces}
          savedPlacesRef={savedPlacesRef}
          onQueryChange={setQuery}
          onSearch={search}
          onDismissResults={dismissPlaceSearchResults}
          onCancelSelection={() => {
            setEndpointTarget(null);
            setCandidateFor(null);
            setInsertIndex(null);
            setTab("plan");
          }}
          onScrollToSaved={() => savedPlacesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          onToggleSaved={toggleSaved}
          onSelectPlace={(place, time) =>
            endpointTarget ? setEndpoint(place, time) : candidateFor ? addCandidate(place) : addPlace(place, time)
          }
          onSavedCategoryChange={setRouteSavedCategory}
          onOpenSavedPlaces={() => setTab("saved")}
        />
      )}
      {(tab === "trips" || (tab === "plan" && trips.length === 0)) && (
        <TripList
          trips={trips}
          displayedTrips={displayedTrips}
          activeTripId={activeTripId}
          onAdd={addTrip}
          onOpen={openTrip}
          onRename={renameTrip}
          onRemove={removeTrip}
        />
      )}
      {tab === "saved" && (
        <SavedPlacesPage
          places={savedPlaces}
          filteredPlaces={filteredSavedPlaces}
          categories={SAVED_CATEGORIES}
          activeCategory={savedCategory}
          onCategoryChange={setSavedCategory}
          onAddCategory={addSavedCategory}
          onOpenSearch={() => {
            setSavedSearchOpen(true);
            setResults([]);
            setSearchError("");
            setQuery("");
          }}
          onRemove={removeSavedPlace}
          onRemoveCategory={removePlaceCategory}
          onEditCategories={editSavedCategory}
          onEditMemo={editMemo}
        />
      )}
      {savedSearchOpen && tab === "saved" && (
        <SavedPlaceSearchOverlay
          autocomplete={autocomplete}
          query={query}
          results={results}
          searching={searching}
          error={searchError}
          savedPlaces={savedPlaces}
          onQueryChange={setQuery}
          onSearch={search}
          onDismiss={closeSavedSearch}
          onSave={openSaveCategoryPicker}
        />
      )}
      {pendingSavePlace && (
        <SaveCategoryDialog
          place={pendingSavePlace}
          categories={savedCategories}
          selectedCategories={pendingSaveCategories}
          onToggle={togglePendingSaveCategory}
          onAddCategory={addSavedCategory}
          onSave={() => savePlaceInCategories(pendingSavePlace)}
          onClose={closeSaveCategoryPicker}
        />
      )}
      {categoryManagerOpen && (
        <CategoryManagerDialog
          categories={savedCategories}
          places={savedPlaces}
          onRename={renameSavedCategory}
          onDelete={deleteSavedCategory}
          onAdd={addSavedCategory}
          onClose={() => setCategoryManagerOpen(false)}
        />
      )}
      {categoryPlace && (
        <PlaceCategoryDialog
          place={categoryPlace}
          categories={savedCategories}
          onChange={(categories) => updatePlaceCategories(categoryPlace, categories)}
          onAddCategory={addSavedCategory}
          onClose={() => setCategoryPlace(null)}
        />
      )}
      {tripCreator && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTripCreator(null);
          }}
        >
          <section
            className="app-dialog trip-creator-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-creator-title"
          >
            <div className="dialog-title">
              <div>
                <span>새로운 일정</span>
                <h2 id="trip-creator-title">새 여행 만들기</h2>
              </div>
              <button onClick={() => setTripCreator(null)} aria-label="닫기">
                ×
              </button>
            </div>
            <label className="trip-field">
              <span>
                여행 이름 <strong>필수</strong>
              </span>
              <input
                value={tripCreator.title}
                onChange={(event) => setTripCreator({ ...tripCreator, title: event.target.value, error: "" })}
                maxLength={40}
                placeholder="예: 강원도 가족 여행"
              />
            </label>
            <DateRangePicker
              startDate={tripCreator.startDate}
              endDate={tripCreator.endDate}
              onChange={(startDate, endDate) => setTripCreator({ ...tripCreator, startDate, endDate, error: "" })}
            />
            {tripCreator.error && <p className="dialog-error">{tripCreator.error}</p>}
            <div className="dialog-actions">
              <button onClick={() => setTripCreator(null)}>취소</button>
              <button className="dialog-primary" onClick={createTrip}>
                여행 만들기
              </button>
            </div>
          </section>
        </div>
      )}
      {dateEditor && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDateEditor(null);
          }}
        >
          <section
            className="app-dialog date-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="date-editor-title"
          >
            <div className="dialog-title">
              <div>
                <span>{days.find((day) => day.id === dateEditor.dayId)?.label}</span>
                <h2 id="date-editor-title">여행 날짜 수정</h2>
              </div>
              <button onClick={() => setDateEditor(null)} aria-label="닫기">
                ×
              </button>
            </div>
            <input
              type="date"
              value={dateEditor.value}
              onChange={(event) => setDateEditor({ ...dateEditor, value: event.target.value })}
            />
            <p className="date-dialog-help">선택한 일차 이후의 날짜도 연속되도록 자동으로 변경됩니다.</p>
            <div className="dialog-actions">
              <button onClick={() => setDateEditor(null)}>취소</button>
              <button className="dialog-primary" onClick={saveDayDate}>
                날짜 저장
              </button>
            </div>
          </section>
        </div>
      )}
      {editor && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditor(null);
          }}
        >
          <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="text-editor-title">
            <div className="dialog-title">
              <div>
                <span>{editor.kind === "memo" ? "방문 전에 기억할 정보" : "길담"}</span>
                <h2 id="text-editor-title">{editor.title}</h2>
              </div>
              <button onClick={() => setEditor(null)} aria-label="닫기">
                ×
              </button>
            </div>
            {editor.kind === "memo" ? (
              <textarea
                value={editor.value}
                onChange={(event) => setEditor({ ...editor, value: event.target.value })}
                placeholder="추천 메뉴, 주차 정보, 운영 시간 등을 기록하세요"
                rows={5}
              />
            ) : (
              <input
                value={editor.value}
                onChange={(event) => setEditor({ ...editor, value: event.target.value })}
                maxLength={40}
                placeholder={editor.kind.startsWith("category") ? "카테고리 이름" : "여행 이름"}
              />
            )}{" "}
            {editorError && <p className="dialog-error">{editorError}</p>}
            <div className="dialog-actions">
              <button onClick={() => setEditor(null)}>취소</button>
              <button className="dialog-primary" onClick={submitEditor}>
                저장
              </button>
            </div>
          </section>
        </div>
      )}
      <BottomNavigation tab={tab} onChange={changeTab} />
    </main>
  );
}
