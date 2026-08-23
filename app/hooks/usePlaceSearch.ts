"use client";

import { type FormEvent, useState } from "react";
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
    try {
      const params = new URLSearchParams({ q: term });
      if (previousPlace) {
        params.set("fromLng", String(previousPlace.longitude));
        params.set("fromLat", String(previousPlace.latitude));
      }
      if (nextPlace) {
        params.set("toLng", String(nextPlace.longitude));
        params.set("toLat", String(nextPlace.latitude));
      }
      if (candidateMain) {
        params.set("mainLng", String(candidateMain.longitude));
        params.set("mainLat", String(candidateMain.latitude));
      }
      const response = await fetch(`${apiBase}/api/places/search?${params}`);
      const data = (await response.json()) as { places?: Place[]; error?: string; source?: Exclude<SearchSource, ""> };
      if (!response.ok) throw new Error(data.error);
      setResults(data.places ?? []);
      setSource(data.source ?? "");
      if (!(data.places ?? []).length) setSearchError("검색 결과가 없습니다.");
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "검색에 실패했습니다.");
    } finally {
      setSearching(false);
    }
  }

  function resetSearch() {
    setQuery("");
    setResults([]);
    setSearchError("");
    setSource("");
  }

  return { query, setQuery, results, setResults, searching, searchError, setSearchError, source, search, resetSearch };
}
