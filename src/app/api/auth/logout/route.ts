import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clearCookie } from "@/lib/auth/sessionCookies";

export const runtime = "nodejs";

export async function POST() {
  clearCookie(env.SESSION_COOKIE_NAME);
  clearCookie(env.MFA_PENDING_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}

