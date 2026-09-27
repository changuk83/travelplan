import { applyScheduleCommand } from "../../app/domain/schedule-service";
import type { ScheduleCommandRequest, ScheduleState } from "../../app/domain/schedule";
import { fingerprintStateRequest, lookupWriteResult, readState, StoreError, writeState } from "./state-store";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new StoreError(400, "INVALID_REQUEST", "요청 내용을 확인해 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new StoreError(413, "REQUEST_TOO_LARGE", "요청이 너무 큽니다.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new StoreError(400, "INVALID_REQUEST", "요청 내용을 확인해 주세요.");
  }
}

/** userId must come from server authentication, never from the model or request body. */
export async function handleScheduleApi(request: Request, db: D1Database, userId: string, deviceId: string) {
  try {
    const path = new URL(request.url).pathname;
    if (path === "/api/state" && request.method === "GET") return json(await readState(db, userId));
    if (path === "/api/state" && request.method === "PUT") {
      const body = await readBody(request);
      const state = {
        trips: body.trips,
        savedPlaces: body.savedPlaces,
        savedCategories: body.savedCategories,
      } as ScheduleState;
      return json(
        await writeState(db, userId, deviceId, state, body.expectedRevision as number, body.requestId as string),
      );
    }
    if (path === "/api/schedule/commands" && request.method === "POST") {
      const body = (await readBody(request)) as unknown as ScheduleCommandRequest;
      if (
        !Number.isSafeInteger(body.expectedRevision) ||
        body.expectedRevision < 0 ||
        !Number.isSafeInteger(body.expectedTripUpdatedAt) ||
        body.expectedTripUpdatedAt < 0 ||
        typeof body.requestId !== "string" ||
        !body.requestId.trim() ||
        body.requestId.length > 200 ||
        !body.command ||
        typeof body.command !== "object"
      ) {
        throw new StoreError(400, "INVALID_REQUEST", "일정 변경 요청을 확인해 주세요.");
      }
      const fingerprint = await fingerprintStateRequest({ operation: "schedule-command", ...body });
      const previous = await lookupWriteResult(db, userId, body.requestId, fingerprint);
      if (previous) return json(previous);
      const current = await readState(db, userId);
      if (current.revision !== body.expectedRevision)
        throw new StoreError(
          409,
          "REVISION_CONFLICT",
          "다른 화면에서 일정이 변경되었습니다. 최신 일정을 불러와 주세요.",
        );
      const result = applyScheduleCommand(current, body.command, body.expectedTripUpdatedAt);
      if (result.error) throw new StoreError(409, "COMMAND_REJECTED", result.error);
      return json(
        await writeState(db, userId, deviceId, result.state, body.expectedRevision, body.requestId, fingerprint),
      );
    }
    return json({ error: "지원하지 않는 요청입니다." }, 405);
  } catch (error) {
    if (error instanceof StoreError) return json({ error: error.message, code: error.code }, error.status);
    // Do not expose database schema, SQL, or request data in user-facing errors.
    return json({ error: "일정을 저장하거나 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, 500);
  }
}
