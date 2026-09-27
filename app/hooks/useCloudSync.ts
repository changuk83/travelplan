"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { initialTrip } from "../domain/trip";
import type { Place, SavedCategory, TripPlan } from "../domain/types";
import type { ScheduleAction, ScheduleState, VersionedState } from "../domain/schedule";
import { applyScheduleCommand } from "../domain/schedule-service";

type SyncStatus = "loading" | "ready" | "saving" | "error" | "conflict";
type Write = { path: string; method: string; body: string };
class RejectedRequest extends Error {}
const fingerprint = (s: ScheduleState) => JSON.stringify([s.trips, s.savedPlaces, s.savedCategories]);
const syncStorageKey = (apiBase: string) => "gildam-sync:" + encodeURIComponent(apiBase.replace(/\/$/, ""));
function readConfirmed(apiBase: string): { fingerprint: string; revision: number } | null {
  const raw = localStorage.getItem(syncStorageKey(apiBase));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { fingerprint?: unknown; revision?: unknown };
    return typeof value.fingerprint === "string" && Number.isSafeInteger(value.revision)
      ? (value as { fingerprint: string; revision: number })
      : null;
  } catch {
    return null;
  }
}
function rememberConfirmed(apiBase: string, value: string, revision: number) {
  if (apiBase) localStorage.setItem(syncStorageKey(apiBase), JSON.stringify({ fingerprint: value, revision }));
}

export function useCloudSync(props: {
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [syncError, setSyncError] = useState("");
  const [revision, setRevision] = useState<number | null>(null);
  const current = useRef(props);
  const version = useRef<number | null>(null);
  const baseline = useRef("");
  const blocked = useRef(true);
  const conflict = useRef(false);
  const pending = useRef<Write | null>(null);
  const pendingCommand = useRef<{ actionId: string; write: Write; before: string } | null>(null);
  const flight = useRef<Promise<number> | null>(null);
  const commandBusy = useRef(false);
  const actionFlight = useRef(false);
  const reading = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const appliedActions = useRef(new Set<string>());
  useLayoutEffect(() => {
    current.current = props;
  });

  const fail = useCallback((cause: unknown) => {
    blocked.current = true;
    const message = cause instanceof Error ? cause.message : "저장하지 못했어요. 연결을 확인해 주세요.";
    if (mounted.current) {
      setSyncStatus(conflict.current ? "conflict" : "error");
      setSyncError(message);
    }
    return message;
  }, []);

  const request = useCallback(async (write?: Write): Promise<VersionedState> => {
    let deviceId = localStorage.getItem("gildam-device-id");
    if (!deviceId) {
      deviceId = "device_" + crypto.randomUUID();
      localStorage.setItem("gildam-device-id", deviceId);
    }
    const response = await fetch(current.current.apiBase.replace(/\/$/, "") + (write?.path ?? "/api/state"), {
      method: write?.method ?? "GET",
      headers: { "content-type": "application/json", "x-gildam-device": deviceId },
      ...(write ? { body: write.body } : {}),
    });
    if (response.status === 409) {
      const detail = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
      if (detail.code === "COMMAND_REJECTED") {
        throw new RejectedRequest(detail.error || "일정이 변경되어 요청을 적용할 수 없어요. 다시 요청해 주세요.");
      }
      conflict.current = true;
      throw new RejectedRequest(
        "다른 곳에서 일정이 변경됐어요. 이 기기의 수정은 보존했습니다. 서버 일정을 다시 불러와 확인해 주세요.",
      );
    }
    if (response.status >= 400 && response.status < 500) {
      const detail = (await response.json().catch(() => ({}))) as { error?: string };
      throw new RejectedRequest(detail.error || "요청을 적용할 수 없어요. 내용을 확인하고 다시 요청해 주세요.");
    }
    if (!response.ok) throw new Error("저장 서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    const data = (await response.json()) as VersionedState;
    if (
      !Number.isSafeInteger(data.revision) ||
      data.revision < 0 ||
      !Array.isArray(data.trips) ||
      !Array.isArray(data.savedPlaces) ||
      !Array.isArray(data.savedCategories)
    ) {
      throw new Error("저장 서버 업데이트가 필요해요. 현재 수정은 이 기기에 보관하고 있습니다.");
    }
    return data;
  }, []);

  const applyState = useCallback((data: VersionedState, selectTrip: boolean) => {
    const p = current.current;
    rememberConfirmed(p.apiBase, fingerprint(data), data.revision);
    baseline.current = fingerprint(data);
    version.current = data.revision;
    current.current = { ...p, trips: data.trips, savedPlaces: data.savedPlaces, savedCategories: data.savedCategories };
    p.setTrips(data.trips);
    p.setSavedPlaces(data.savedPlaces);
    p.setSavedCategories(data.savedCategories);
    if (selectTrip) {
      const selected = data.trips.length ? initialTrip(data.trips) : undefined;
      p.setActiveTripId(selected?.id ?? "");
      p.setActiveDayId(selected?.days[0]?.id ?? "");
    }
    setRevision(data.revision);
  }, []);

  const reloadCloud = useCallback(
    async (options: { discardLocal?: boolean } = {}) => {
      if (!current.current.apiBase) {
        version.current = 0;
        blocked.current = false;
        setRevision(0);
        setCloudReady(true);
        setSyncStatus("ready");
        setSyncError("");
        return;
      }
      if (pendingCommand.current)
        throw new Error("결과를 확인하지 못한 변경이 있어요. 저장 다시 시도로 완료 여부를 확인해 주세요.");
      if (flight.current || commandBusy.current) throw new Error("진행 중인 저장이 끝나면 다시 불러와 주세요.");
      const token = ++generation.current;
      reading.current = true;
      const before = fingerprint(current.current);
      blocked.current = true;
      setSyncStatus("loading");
      try {
        const data = await request();
        if (!mounted.current || token !== generation.current) return;
        if (fingerprint(current.current) !== before) {
          conflict.current = true;
          throw new Error(
            "불러오는 동안 수정한 내용이 있어요. 이 기기의 수정을 보존했습니다. 다시 불러오기를 선택해 주세요.",
          );
        }
        const confirmed = readConfirmed(current.current.apiBase);
        const dirty = confirmed !== null && confirmed.fingerprint !== before;
        if (!options.discardLocal && dirty && fingerprint(data) !== before) {
          conflict.current = true;
          throw new Error(
            "이 기기에 아직 저장하지 못한 수정이 있어요. 내용을 보존했습니다. 서버 일정을 불러오려면 로컬 수정 삭제를 확인해 주세요.",
          );
        }
        // Legacy clients have no confirmed baseline. Keep a recoverable copy before
        // their first replacement; also back up an explicitly discarded draft.
        if ((!confirmed || dirty) && fingerprint(data) !== before) {
          const [trips, savedPlaces, savedCategories] = JSON.parse(before) as [TripPlan[], Place[], SavedCategory[]];
          localStorage.setItem(
            syncStorageKey(current.current.apiBase) + ":draft-backup",
            JSON.stringify({ savedAt: Date.now(), state: { trips, savedPlaces, savedCategories } }),
          );
        }
        applyState(data, true);
        pending.current = null;
        conflict.current = false;
        blocked.current = false;
        setCloudReady(true);
        setSyncStatus("ready");
        setSyncError("");
      } catch (cause) {
        if (mounted.current && token === generation.current) fail(cause);
      } finally {
        if (token === generation.current) reading.current = false;
      }
    },
    [request, applyState, fail],
  );

  const flushPending = useCallback((): Promise<number> => {
    if (!current.current.apiBase) return Promise.resolve(0);
    if (reading.current) return Promise.reject(new Error("서버 일정을 불러오는 중이에요."));
    if (flight.current) return flight.current;
    if (commandBusy.current) return Promise.reject(new Error("일정 변경을 적용 중이에요. 잠시 기다려 주세요."));
    if (version.current === null || conflict.current)
      return Promise.reject(new Error("서버 일정을 먼저 불러와 주세요. 현재 수정은 보존되어 있어요."));
    const task = (async () => {
      try {
        setSyncStatus("saving");
        if (pendingCommand.current) {
          const retry = pendingCommand.current;
          const data = await request(retry.write);
          pendingCommand.current = null;
          appliedActions.current.add(retry.actionId);
          if (fingerprint(current.current) !== retry.before) {
            conflict.current = true;
            throw new Error(
              "변경은 서버에 적용됐지만 이 기기의 수정도 있어요. 로컬 수정을 보존했습니다. 서버 일정을 다시 불러와 확인해 주세요.",
            );
          }
          if (mounted.current) applyState(data, false);
        }
        while (mounted.current) {
          const snapshot = current.current;
          const sentFingerprint = pending.current
            ? fingerprint(JSON.parse(pending.current.body) as ScheduleState)
            : fingerprint(snapshot);
          if (!pending.current && sentFingerprint === baseline.current) break;
          // Retain the exact request, including requestId, after a transient failure.
          pending.current ??= {
            path: "/api/state",
            method: "PUT",
            body: JSON.stringify({
              trips: snapshot.trips,
              savedPlaces: snapshot.savedPlaces,
              savedCategories: snapshot.savedCategories,
              expectedRevision: version.current,
              requestId: crypto.randomUUID(),
            }),
          };
          const data = await request(pending.current);
          pending.current = null;
          version.current = data.revision;
          baseline.current = sentFingerprint;
          rememberConfirmed(current.current.apiBase, sentFingerprint, data.revision);
          if (mounted.current) setRevision(data.revision);
          // A response must never replace edits made while this request was in flight.
        }
        blocked.current = false;
        if (mounted.current) {
          setSyncStatus("ready");
          setSyncError("");
        }
        return version.current!;
      } catch (cause) {
        if (cause instanceof RejectedRequest) pendingCommand.current = null;
        fail(cause);
        throw cause;
      }
    })();
    flight.current = task;
    void task
      .finally(() => {
        flight.current = null;
      })
      .catch(() => {});
    return task;
  }, [request, applyState, fail]);

  const applyCommand = useCallback(
    async (action: ScheduleAction): Promise<string | null> => {
      if (appliedActions.current.has(action.id)) return null;
      if (!current.current.apiBase) {
        const result = applyScheduleCommand(current.current, action.command, action.expectedTripUpdatedAt);
        if (result.error) return result.error;
        appliedActions.current.add(action.id);
        applyState({ ...result.state, revision: 0 }, false);
        return null;
      }
      if (actionFlight.current) return "다른 변경을 적용 중이에요. 잠시 기다려 주세요.";
      actionFlight.current = true;
      try {
        if (pendingCommand.current && pendingCommand.current.actionId !== action.id) {
          return "이전에 요청한 변경의 결과를 먼저 확인해 주세요.";
        }
        await flushPending();
        if (appliedActions.current.has(action.id)) return null;
        commandBusy.current = true;
        const before = pendingCommand.current?.before ?? fingerprint(current.current);
        const write = pendingCommand.current?.write ?? {
          path: "/api/schedule/commands",
          method: "POST",
          body: JSON.stringify({
            command: action.command,
            expectedTripUpdatedAt: action.expectedTripUpdatedAt,
            expectedRevision: version.current,
            requestId: action.id,
          }),
        };
        pendingCommand.current = { actionId: action.id, write, before };
        setSyncStatus("saving");
        let data: VersionedState;
        try {
          data = await request(write);
        } catch (cause) {
          if (cause instanceof RejectedRequest) throw cause;
          data = await request(write);
        }
        pendingCommand.current = null;
        appliedActions.current.add(action.id);
        if (!mounted.current) return null;
        if (fingerprint(current.current) !== before) {
          conflict.current = true;
          throw new Error(
            "변경은 서버에 적용됐지만 그동안 이 기기에서도 수정이 있었어요. 로컬 수정을 보존했습니다. 서버 일정을 다시 불러와 확인해 주세요.",
          );
        }
        applyState(data, false);
        blocked.current = false;
        setSyncStatus("ready");
        setSyncError("");
        return null;
      } catch (cause) {
        if (cause instanceof RejectedRequest) pendingCommand.current = null;
        return fail(cause);
      } finally {
        commandBusy.current = false;
        actionFlight.current = false;
      }
    },
    [flushPending, request, applyState, fail],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // This is a request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (props.tripsLoaded && props.savedLoaded) {
      queueMicrotask(() => {
        if (!cancelled) void reloadCloud();
      });
    }
    return () => {
      cancelled = true;
    };
  }, [props.apiBase, props.tripsLoaded, props.savedLoaded, reloadCloud]);
  useEffect(() => {
    if (!cloudReady || blocked.current || commandBusy.current) return;
    const timer = window.setTimeout(() => {
      void flushPending().catch(() => {});
    }, 700);
    return () => window.clearTimeout(timer);
  }, [cloudReady, props.trips, props.savedPlaces, props.savedCategories, flushPending]);

  return { cloudReady, syncError, syncStatus, revision, flushPending, applyCommand, reloadCloud };
}
