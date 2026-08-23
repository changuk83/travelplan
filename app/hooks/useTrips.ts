"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import { initialDays, initialTrip, initialTrips } from "../domain/trip";
import type { DayPlan, TripPlan } from "../domain/types";

export function useTrips() {
  const [trips, setTrips] = useState<TripPlan[]>(initialTrips);
  const [activeTripId, setActiveTripId] = useState("trip-new");
  const [tripsLoaded, setTripsLoaded] = useState(false);
  const [activeDayId, setActiveDayId] = useState("day-1");
  const days = trips.find((trip) => trip.id === activeTripId)?.days ?? trips[0]?.days ?? initialDays;
  const setDays: Dispatch<SetStateAction<DayPlan[]>> = useCallback(
    (update) => {
      setTrips((items) =>
        items.map((trip) => {
          if (trip.id !== activeTripId) return trip;
          const nextDays = typeof update === "function" ? update(trip.days) : update;
          return { ...trip, days: nextDays, updatedAt: Date.now() };
        }),
      );
    },
    [activeTripId],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem("gildam-trips");
        const legacy = localStorage.getItem("gildam-trip-days");
        const parsed = stored ? (JSON.parse(stored) as TripPlan[]) : null;
        if (parsed?.length) {
          const selected = initialTrip(parsed);
          setTrips(parsed);
          setActiveTripId(selected.id);
          setActiveDayId(selected.days[0].id);
        } else if (legacy) {
          const legacyDays = JSON.parse(legacy) as DayPlan[];
          setTrips([{ ...initialTrips[0], days: legacyDays }]);
        }
      } catch {
        // Invalid legacy local data should not prevent the app from opening.
      } finally {
        setTripsLoaded(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (tripsLoaded) localStorage.setItem("gildam-trips", JSON.stringify(trips));
  }, [trips, tripsLoaded]);

  return { trips, setTrips, activeTripId, setActiveTripId, tripsLoaded, days, setDays, activeDayId, setActiveDayId };
}
