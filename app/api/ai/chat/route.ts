import { handleAiChat } from "../../../../server/ai-assistant";
import { GET as search } from "../../places/search/route";
import { POST as directions } from "../../routes/route";

// Local preview uses local secrets even when the rest of the app uses the deployed API.
// Production AI requests are sent directly to the rate-limited API Worker.
let windowStart = 0;
let requestCount = 0;

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "AI 도우미 연결을 확인해 주세요." }, { status: 503 });
  }
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin) {
    return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  }
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    windowStart = now;
    requestCount = 0;
  }
  if (++requestCount > 5) {
    return Response.json({ error: "잠시 후 다시 질문해 주세요." }, { status: 429, headers: { "retry-after": "60" } });
  }
  return handleAiChat(
    request,
    {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
    },
    {
      search: (params) => search(new Request(`${origin}/api/places/search?${params}`)),
      route: ({ scope, ...body }) =>
        directions(
          new Request(`${origin}/api/routes`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, cacheScope: scope }),
          }),
        ),
    },
  );
}
