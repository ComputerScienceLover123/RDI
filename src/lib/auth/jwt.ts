import { jwtVerify, SignJWT } from "jose";
import { env } from "../env";
import type { MfaPendingClaims, SessionClaims } from "./types";

const secretBytes = new TextEncoder().encode(env.JWT_SECRET);

export type JwtSession = SessionClaims;
export type JwtMfaPending = MfaPendingClaims;

export async function signSessionToken(payload: Omit<SessionClaims, "typ">) {
  const ttlSeconds = env.JWT_SESSION_TTL_SECONDS as unknown as number;

  return new SignJWT({ ...payload, typ: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + ttlSeconds * 1000))
    .sign(secretBytes);
}

export async function signMfaPendingToken(payload: Omit<MfaPendingClaims, "typ">) {
  const ttlSeconds = env.JWT_MFA_PENDING_TTL_SECONDS as unknown as number;

  return new SignJWT({ ...payload, typ: "mfa_pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + ttlSeconds * 1000))
    .sign(secretBytes);
}

export async function verifyJwt(token: string): Promise<JwtSession | JwtMfaPending> {
  const { payload } = await jwtVerify(token, secretBytes, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });

  if (payload.typ === "session") {
    const role = payload.role as SessionClaims["role"];
    return {
      sub: payload.sub as string,
      role,
      storeId: (payload.storeId as string | null) ?? null,
      forcePasswordChange: Boolean(payload.forcePasswordChange),
      typ: "session",
    };
  }

  if (payload.typ === "mfa_pending") {
    return {
      sub: payload.sub as string,
      typ: "mfa_pending",
    };
  }

  throw new Error("Unexpected JWT type");
}

