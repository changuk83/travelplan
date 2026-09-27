"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Place, RouteEndpoint, SearchSource } from "../domain/types";

export function usePlaceSearch({
  apiBase,
  previousPlace,
  nextPlace,
  candidateMain,
}: {
  apiBase: string;
  previousPlace: RouteEndpoint | null;
  nextPlace: RouteEndpoint | null;
  candidateMain: Place | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [source, setSource] = useState<SearchSource>("");
  const cache = useRef(new Map<string, { at: number; places: Place[]; source: SearchSource }>());
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const context = new URLSearchParams();
  for (const [prefix, point] of [
    ["from", previousPlace],
    ["to", nextPlace],
    ["main", candidateMain],
  ] as const) {
    if (point) {
      context.set(`${prefix}Lng`, String(point.longitude));
      context.set(`${prefix}Lat`, String(point.latitude));
    }
  }
  const contextKey = context.toString();
  const lookup = useCallback(
    async (term: string, signal: AbortSignal) => {
      const params = new URLSearchParams(contextKey);
      params.set("q", term);
      const url = `${apiBase}/api/places/search?${params}`;
      const cached = cache.current.get(url);
      if (cached && Date.now() - cached.at < 60_000) return cached;
      const response = await fetch(url, { signal });
      const data = (await response.json()) as { places?: Place[]; source?: SearchSource; error?: string };
      if (!response.ok) throw new Error(data.error || "검색에 실패했습니다.");
      const result = { places: data.places ?? [], source: data.source ?? ("" as SearchSource), at: Date.now() };
      if (!signal.aborted) {
        if (cache.current.size >= 30) cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(url, result);
      }
      return result;
    },
    [apiBase, contextKey],
  );
  const loadSuggestions = useCallback(
    async (term: string, signal: AbortSignal) => (await lookup(term, signal)).places,
    [lookup],
  );
  const changeQuery = (value: string) => {
    requestRef.current?.abort();
    setSearching(false);
    setQuery(value);
    setResults([]);
    setSearchError("");
  };
  function onSuggestionSelect(place: Place) {
    changeQuery(place.name);
    setResults([place]);
    setSource("");
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearchError("장소 이름이나 주소를 두 글자 이상 입력해 주세요.");
      return;
    }
    setSearching(true);
    setSearchError("");
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const data = await lookup(term, controller.signal);
      if (controller.signal.aborted) return;
      setResults(data.places ?? []);
      setSource(data.source ?? "");
      if (!(data.places ?? []).length) setSearchError("검색 결과가 없습니다.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setSearchError(error instanceof Error ? error.message : "검색에 실패했습니다.");
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  function resetSearch() {
    changeQuery("");
    setResults([]);
    setSearchError("");
    setSource("");
  }

  return {
    query,
    setQuery: changeQuery,
    results,
    setResults,
    searching,
    searchError,
    setSearchError,
    source,
    search,
    resetSearch,
    autocomplete: { loadSuggestions, onSuggestionSelect },
  };
}
