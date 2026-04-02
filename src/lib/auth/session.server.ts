import { cookies } from "next/headers";
import { env } from "../env";
import { verifyJwt, JwtMfaPending } from "./jwt";
import type { SessionClaims } from "./types";

export async function getSessionClaims(): Promise<SessionClaims | null> {
  const c = cookies().get(env.SESSION_COOKIE_NAME)?.value;
  if (!c) return null;
  try {
    const jwt = await verifyJwt(c);
    if (jwt.typ !== "session") return null;
    return jwt;
  } catch {
    return null;
  }
}

export async function getMfaPendingClaims(): Promise<JwtMfaPending | null> {
  const c = cookies().get(env.MFA_PENDING_COOKIE_NAME)?.value;
  if (!c) return null;
  try {
    const jwt = await verifyJwt(c);
    if (jwt.typ !== "mfa_pending") return null;
    return jwt;
  } catch {
    return null;
  }
}

