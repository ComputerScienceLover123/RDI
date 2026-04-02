import { generateSecret, generateURI, verifySync } from "otplib";
import { env } from "../env";

export const mfaIssuer = env.JWT_ISSUER;

export function generateTotpSecret(email: string) {
  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: mfaIssuer, label: email, secret });
  return { secret, otpauthUrl };
}

export function verifyTotpCode(secret: string, code: string) {
  return verifySync({ secret, token: code }).valid;
}

export function normalizeTotpCode(input: string) {
  return input.replace(/\s+/g, "").trim();
}

