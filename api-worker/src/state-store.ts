import type { ScheduleState, VersionedState } from "../../app/domain/schedule";
import type { DayPlan, Place, RouteEndpoint } from "../../app/domain/types";

export class StoreError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Row = Record<string, string | number | null>;
const invalid = () => {
  throw new StoreError(400, "INVALID_STATE", "저장할 일정 데이터가 올바르지 않습니다.");
};
function text(value: unknown, max = 300, required = true): asserts value is string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) invalid();
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) invalid();
}
function endpoint(p: RouteEndpoint) {
  if (!p || typeof p !== "object") invalid();
  text(p.name);
  if (
    !Number.isFinite(p.longitude) ||
    p.longitude < -180 ||
    p.longitude > 180 ||
    !Number.isFinite(p.latitude) ||
    p.latitude < -90 ||
    p.latitude > 90
  )
    invalid();
}
function place(p: Place) {
  endpoint(p);
  text(p.id, 300);
  text(p.category, 500, false);
  text(p.address, 1000, false);
  if (p.memo !== undefined) text(p.memo, 10000, false);
  if (p.link !== undefined) text(p.link, 2000, false);
  if (p.savedCategory !== undefined) text(p.savedCategory, 300);
  if (p.savedCategories !== undefined) {
    if (!Array.isArray(p.savedCategories) || p.savedCategories.length > 50) invalid();
    p.savedCategories.forEach((v) => text(v, 300));
    unique(p.savedCategories);
  }
}
function validate(state: ScheduleState) {
  if (
    !state ||
    !Array.isArray(state.trips) ||
    !Array.isArray(state.savedPlaces) ||
    !Array.isArray(state.savedCategories)
  )
    invalid();
  if (
    state.trips.length > 30 ||
    state.savedPlaces.length > 500 ||
    state.savedCategories.length > 50 ||
    JSON.stringify(state).length > 2_000_000
  )
    invalid();
  const dayIds: string[] = [],
    stopIds: string[] = [],
    candidateIds: string[] = [];
  state.trips.forEach((trip) => {
    if (!trip || typeof trip !== "object") invalid();
    text(trip.id);
    text(trip.title);
    if (!Number.isSafeInteger(trip.updatedAt) || trip.updatedAt < 0 || !Array.isArray(trip.days)) invalid();
    trip.days.forEach((day) => {
      if (!day || typeof day !== "object") invalid();
      text(day.id);
      dayIds.push(day.id);
      text(day.label);
      text(day.date, 100, false);
      if (day.date.includes("|")) invalid();
      if (day.dateValue !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day.dateValue)) invalid();
      endpoint(day.start);
      endpoint(day.goal);
      if (!Array.isArray(day.places) || day.places.length > 30) invalid();
      day.places.forEach((p) => {
        place(p);
        stopIds.push(`${day.id}:${p.id}`);
      });
      unique(day.places.map((p) => p.id));
      if (day.candidates !== undefined) {
        if (!day.candidates || typeof day.candidates !== "object" || Array.isArray(day.candidates)) invalid();
        Object.entries(day.candidates).forEach(([id, candidates]) => {
          if (!day.places.some((p) => p.id === id) || !Array.isArray(candidates) || candidates.length > 100) invalid();
          candidates.forEach((p) => {
            place(p);
            candidateIds.push(`${day.id}:${id}:${p.id}`);
          });
          unique(candidates.map((p) => p.id));
        });
      }
    });
  });
  unique(state.trips.map((t) => t.id));
  unique(dayIds);
  unique(stopIds);
  unique(candidateIds);
  state.savedPlaces.forEach(place);
  unique(state.savedPlaces.map((p) => p.id));
  state.savedCategories.forEach((v) => {
    text(v, 300);
    if (v !== v.trim()) invalid();
  });
  unique(state.savedCategories);
}

function decodePlace(row: Row): Place {
  let categories: string[] | undefined;
  if (typeof row.saved_category === "string") {
    try {
      const parsed: unknown = JSON.parse(row.saved_category);
      categories = Array.isArray(parsed) ? parsed : [row.saved_category];
    } catch {
      categories = [row.saved_category];
    }
  }
  return {
    id: String(row.place_id),
    name: String(row.name),
    category: String(row.category),
    address: String(row.address),
    longitude: Number(row.longitude),
    latitude: Number(row.latitude),
    ...(row.link !== null && row.link !== undefined ? { link: String(row.link) } : {}),
    ...(row.memo !== null && row.memo !== undefined ? { memo: String(row.memo) } : {}),
    ...(categories ? { savedCategories: categories } : {}),
  };
}

export async function readState(db: D1Database, userId: string): Promise<VersionedState> {
  const queries = [
    "SELECT * FROM trips WHERE user_id=? ORDER BY position",
    "SELECT d.* FROM trip_days d JOIN trips t ON t.id=d.trip_id WHERE t.user_id=? ORDER BY d.position",
    "SELECT s.* FROM stops s JOIN trip_days d ON d.id=s.day_id JOIN trips t ON t.id=d.trip_id WHERE t.user_id=? ORDER BY s.position",
    "SELECT c.* FROM stop_candidates c JOIN stops s ON s.id=c.stop_id JOIN trip_days d ON d.id=s.day_id JOIN trips t ON t.id=d.trip_id WHERE t.user_id=? ORDER BY c.position",
    "SELECT * FROM saved_places WHERE user_id=? ORDER BY position",
    "SELECT * FROM saved_categories WHERE user_id=? ORDER BY position",
    "SELECT revision FROM state_revisions WHERE user_id=?",
  ];
  const result = await db.batch<Row>(queries.map((q) => db.prepare(q).bind(userId)));
  const [trips, days, stops, candidates, saved, categories, revisions] = result.map((r) => r.results);
  return {
    revision: Number(revisions[0]?.revision ?? 0),
    trips: trips.map((t) => ({
      id: String(t.id),
      title: String(t.title),
      updatedAt: Number(t.updated_at),
      days: days
        .filter((d) => d.trip_id === t.id)
        .map((d): DayPlan => {
          const date = String(d.date_label).split("|", 2);
          const dayStops = stops.filter((s) => s.day_id === d.id);
          const candidateMap: Record<string, Place[]> = Object.fromEntries(
            dayStops
              .map((s) => [String(s.place_id), candidates.filter((c) => c.stop_id === s.id).map(decodePlace)])
              .filter(([, c]) => (c as Place[]).length),
          );
          return {
            id: String(d.id),
            label: String(d.label),
            date: date.length === 2 ? date[1] : date[0],
            ...(date.length === 2 ? { dateValue: date[0] } : {}),
            start: {
              name: String(d.start_name),
              longitude: Number(d.start_longitude),
              latitude: Number(d.start_latitude),
            },
            goal: { name: String(d.goal_name), longitude: Number(d.goal_longitude), latitude: Number(d.goal_latitude) },
            places: dayStops.map(decodePlace),
            ...(Object.keys(candidateMap).length ? { candidates: candidateMap } : {}),
          };
        }),
    })),
    savedPlaces: saved.map(decodePlace),
    savedCategories: categories.map((c) => String(c.name)),
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function fingerprintStateRequest(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function lookupWriteResult(
  db: D1Database,
  userId: string,
  requestId: string,
  fingerprint: string,
): Promise<VersionedState | null> {
  const row = await db
    .prepare(
      "SELECT fingerprint,result_json FROM state_write_requests WHERE user_id=? AND request_id=? AND created_at>=?",
    )
    .bind(userId, requestId, Date.now() - 24 * 60 * 60 * 1000)
    .first<{ fingerprint: string; result_json: string }>();
  if (!row) return null;
  if (row.fingerprint !== fingerprint)
    throw new StoreError(409, "REQUEST_ID_REUSED", "같은 요청 번호로 다른 변경을 저장할 수 없습니다.");
  return JSON.parse(row.result_json) as VersionedState;
}

export async function writeState(
  db: D1Database,
  userId: string,
  deviceId: string,
  state: ScheduleState,
  expectedRevision: number,
  requestId: string,
  trustedFingerprint?: string,
): Promise<VersionedState> {
  if (expectedRevision === undefined || expectedRevision === null)
    throw new StoreError(428, "REVISION_REQUIRED", "최신 일정을 조회한 뒤 다시 저장해 주세요.");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) invalid();
  text(requestId, 200);
  text(userId);
  text(deviceId);
  validate(state);
  const digest = trustedFingerprint ?? (await fingerprintStateRequest({ state, expectedRevision }));
  const replay = () => lookupWriteResult(db, userId, requestId, digest);
  const prior = await replay();
  if (prior) return prior;
  const now = Date.now();
  const result: VersionedState = { ...state, revision: expectedRevision + 1 };
  const guard = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  const add = (sql: string, ...args: (string | number | null)[]) => statements.push(db.prepare(sql).bind(...args));
  add(
    "INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at",
    userId,
    "기본 사용자",
    now,
    now,
  );
  add("INSERT OR IGNORE INTO state_revisions(user_id,revision) VALUES(?,0)", userId);
  add("UPDATE state_revisions SET revision=revision+1 WHERE user_id=? AND revision=?", userId, expectedRevision);
  add("INSERT INTO state_write_guards(id,matched) VALUES(?,changes())", guard);
  // Never reassign another user's device. Ownership checks run inside the same transaction.
  add(
    "INSERT INTO state_write_guards(id,matched) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM user_devices WHERE device_id=? AND user_id<>?) THEN 0 ELSE 1 END",
    `${guard}:owner`,
    deviceId,
    userId,
  );
  add(
    "INSERT INTO devices(id,created_at,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at",
    deviceId,
    now,
    now,
  );
  add("INSERT OR IGNORE INTO user_devices(device_id,user_id,linked_at) VALUES(?,?,?)", deviceId, userId, now);
  add("DELETE FROM trips WHERE user_id=?", userId);
  add("DELETE FROM saved_places WHERE user_id=?", userId);
  add("DELETE FROM saved_categories WHERE user_id=?", userId);
  state.trips.forEach((t, ti) => {
    add(
      "INSERT INTO trips(id,device_id,user_id,title,position,updated_at) VALUES(?,?,?,?,?,?)",
      t.id,
      deviceId,
      userId,
      t.title,
      ti,
      t.updatedAt,
    );
    t.days.forEach((d, di) => {
      add(
        "INSERT INTO trip_days(id,trip_id,label,date_label,position,start_name,start_longitude,start_latitude,goal_name,goal_longitude,goal_latitude) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        d.id,
        t.id,
        d.label,
        d.dateValue ? `${d.dateValue}|${d.date}` : d.date,
        di,
        d.start.name,
        d.start.longitude,
        d.start.latitude,
        d.goal.name,
        d.goal.longitude,
        d.goal.latitude,
      );
      d.places.forEach((p, pi) => {
        const stopId = `${d.id}:${p.id}`;
        add(
          "INSERT INTO stops(id,day_id,place_id,position,name,category,address,longitude,latitude,link,memo) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          stopId,
          d.id,
          p.id,
          pi,
          p.name,
          p.category,
          p.address,
          p.longitude,
          p.latitude,
          p.link ?? null,
          p.memo ?? null,
        );
        (d.candidates?.[p.id] ?? []).forEach((c, ci) =>
          add(
            "INSERT INTO stop_candidates(id,stop_id,place_id,position,name,category,address,longitude,latitude,link,memo) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            `${stopId}:${c.id}`,
            stopId,
            c.id,
            ci,
            c.name,
            c.category,
            c.address,
            c.longitude,
            c.latitude,
            c.link ?? null,
            c.memo ?? null,
          ),
        );
      });
    });
  });
  state.savedPlaces.forEach((p, i) =>
    add(
      "INSERT INTO saved_places(id,device_id,user_id,place_id,position,name,category,address,longitude,latitude,link,memo,saved_category) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      `${deviceId}:${p.id}`,
      deviceId,
      userId,
      p.id,
      i,
      p.name,
      p.category,
      p.address,
      p.longitude,
      p.latitude,
      p.link ?? null,
      p.memo ?? null,
      p.savedCategories
        ? JSON.stringify(p.savedCategories)
        : p.savedCategory
          ? JSON.stringify([p.savedCategory])
          : null,
    ),
  );
  state.savedCategories.forEach((c, i) =>
    add("INSERT INTO saved_categories(id,user_id,name,position) VALUES(?,?,?,?)", `${userId}:${i}`, userId, c, i),
  );
  add(
    "INSERT INTO state_write_requests(user_id,request_id,fingerprint,result_json,created_at) VALUES(?,?,?,?,?)",
    userId,
    requestId,
    digest,
    JSON.stringify(result),
    now,
  );
  // Keep a bounded retry window: the newest 50 receipts, for at most 24 hours.
  // An older retry still cannot overwrite newer state: its revision fails CAS.
  add(
    "DELETE FROM state_write_requests WHERE user_id=? AND (created_at<? OR request_id IN (SELECT request_id FROM state_write_requests WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 50))",
    userId,
    now - 24 * 60 * 60 * 1000,
    userId,
  );
  add("DELETE FROM state_write_guards WHERE id IN (?,?)", guard, `${guard}:owner`);
  try {
    await db.batch(statements);
  } catch (error) {
    const repeated = await replay();
    if (repeated) return repeated;
    const revision = await db
      .prepare("SELECT revision FROM state_revisions WHERE user_id=?")
      .bind(userId)
      .first<{ revision: number }>();
    if ((revision?.revision ?? 0) !== expectedRevision)
      throw new StoreError(409, "REVISION_CONFLICT", "다른 화면에서 일정이 변경되었습니다. 최신 일정을 불러와 주세요.");
    const message = error instanceof Error ? error.message : String(error);
    if (/constraint|CHECK|UNIQUE/i.test(message))
      throw new StoreError(409, "OWNERSHIP_CONFLICT", "다른 사용자 또는 일정과 식별자가 충돌했습니다.");
    throw error;
  }
  return result;
}
