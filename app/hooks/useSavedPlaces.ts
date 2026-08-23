"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SAVED_CATEGORIES } from "../domain/place";
import type { Place, SavedCategory } from "../domain/types";

export function useSavedPlaces() {
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([]);
  const [savedCategories, setSavedCategories] = useState<SavedCategory[]>(DEFAULT_SAVED_CATEGORIES);
  const [savedLoaded, setSavedLoaded] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem("gildam-saved-places");
        const storedCategories = localStorage.getItem("gildam-saved-categories");
        setSavedPlaces(stored ? (JSON.parse(stored) as Place[]) : []);
        if (storedCategories) {
          const parsed = JSON.parse(storedCategories) as SavedCategory[];
          if (parsed.length) setSavedCategories(parsed);
        }
      } catch {
        setSavedPlaces([]);
      } finally {
        setSavedLoaded(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!savedLoaded) return;
    localStorage.setItem("gildam-saved-places", JSON.stringify(savedPlaces));
    localStorage.setItem("gildam-saved-categories", JSON.stringify(savedCategories));
  }, [savedLoaded, savedPlaces, savedCategories]);

  return { savedPlaces, setSavedPlaces, savedCategories, setSavedCategories, savedLoaded };
}
