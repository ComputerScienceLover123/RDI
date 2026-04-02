import type { NextRequest } from "next/server";

export function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // x-forwarded-for may contain a comma-separated list.
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  // NextRequest exposes `ip` in modern versions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybeIp = (req as any).ip;
  if (typeof maybeIp === "string" && maybeIp.length > 0) return maybeIp;
  return "0.0.0.0";
}

