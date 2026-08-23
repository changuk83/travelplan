"use client";

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { initialTrip } from "../domain/trip";
import type { Place, SavedCategory, TripPlan } from "../domain/types";

export function useCloudSync({
  apiBase,
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
}: {
  apiBase: string;
  tripsLoaded: boolean;
  savedLoaded: boolean;
  trips: TripPlan[];
  savedPlaces: Place[];
  savedCategories: SavedCategory[];
  setTrips: Dispatch<SetStateAction<TripPlan[]>>;
  setActiveTripId: Dispatch<SetStateAction<string>>;
  setActiveDayId: Dispatch<SetStateAction<string>>;
  setSavedPlaces: Dispatch<SetStateAction<Place[]>>;
  setSavedCategories: Dispatch<SetStateAction<SavedCategory[]>>;
}) {
  const [cloudReady, setCloudReady] = useState(false);

  useEffect(() => {
    if (!apiBase || !tripsLoaded || !savedLoaded) return;
    let cancelled = false;
    (async () => {
      let deviceId = localStorage.getItem("gildam-device-id");
      if (!deviceId) {
        deviceId = `device_${crypto.randomUUID().replaceAll("-", "")}`;
        localStorage.setItem("gildam-device-id", deviceId);
      }
      try {
        const response = await fetch(`${apiBase}/api/state`, { headers: { "x-gildam-device": deviceId } });
        if (!response.ok) return;
        const data = (await response.json()) as {
          trips?: TripPlan[];
          savedPlaces?: Place[];
          savedCategories?: SavedCategory[];
        };
        if (!cancelled && data.trips?.length) {
          const selected = initialTrip(data.trips);
          setTrips(data.trips);
          setActiveTripId(selected.id);
          setActiveDayId(selected.days[0].id);
        }
        if (!cancelled && data.savedPlaces?.length) setSavedPlaces(data.savedPlaces);
        if (!cancelled && data.savedCategories?.length) setSavedCategories(data.savedCategories);
      } finally {
        if (!cancelled) setCloudReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    apiBase,
    tripsLoaded,
    savedLoaded,
    setTrips,
    setActiveTripId,
    setActiveDayId,
    setSavedPlaces,
    setSavedCategories,
  ]);

  useEffect(() => {
    if (!apiBase || !cloudReady) return;
    const timer = window.setTimeout(() => {
      const deviceId = localStorage.getItem("gildam-device-id");
      if (deviceId)
        fetch(`${apiBase}/api/state`, {
          method: "PUT",
          headers: { "content-type": "application/json", "x-gildam-device": deviceId },
          body: JSON.stringify({ trips, savedPlaces, savedCategories }),
        }).catch(() => {});
    }, 700);
    return () => window.clearTimeout(timer);
  }, [apiBase, cloudReady, trips, savedPlaces, savedCategories]);

  return { cloudReady };
}
