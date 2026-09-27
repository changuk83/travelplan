export type ReputationSummary = {
  status: "ok" | "insufficient";
  text: string;
  citations: { start: number; end: number; url: string; title: string }[];
  checkedAt: string;
};

export function isReputationSummary(value: unknown): value is ReputationSummary {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ReputationSummary>;
  if (
    (data.status !== "ok" && data.status !== "insufficient") ||
    typeof data.text !== "string" ||
    typeof data.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(data.checkedAt)) ||
    !Array.isArray(data.citations)
  )
    return false;
  let end = 0;
  return data.citations.every((item) => {
    if (
      !item ||
      typeof item.title !== "string" ||
      typeof item.url !== "string" ||
      !Number.isInteger(item.start) ||
      !Number.isInteger(item.end) ||
      item.start < end ||
      item.end < item.start ||
      item.end > data.text!.length
    )
      return false;
    end = item.end;
    try {
      const url = new URL(item.url);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  });
}
