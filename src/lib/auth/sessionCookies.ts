import { cookies } from "next/headers";
import { env } from "../env";

export function setHttpOnlyCookie(params: {
  name: string;
  value: string;
  maxAgeSeconds: number;
  path?: string;
}) {
  const store = cookies();
  const secure = process.env.NODE_ENV === "production";
  store.set({
    name: params.name,
    value: params.value,
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: params.path ?? "/",
    maxAge: params.maxAgeSeconds,
  });
}

export function clearCookie(name: string) {
  const store = cookies();
  const secure = process.env.NODE_ENV === "production";
  store.set({
    name,
    value: "",
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function getSessionCookieName() {
  return env.SESSION_COOKIE_NAME;
}

export function getMfaPendingCookieName() {
  return env.MFA_PENDING_COOKIE_NAME;
}

