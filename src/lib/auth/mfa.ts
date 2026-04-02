import { authenticator } from "otplib";
import { env } from "../env";

export const mfaIssuer = env.JWT_ISSUER;

export function generateTotpSecret(email: string) {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, mfaIssuer, secret);
  return { secret, otpauthUrl };
}

export function verifyTotpCode(secret: string, code: string) {
  // otplib normalizes and validates length/time-step internally.
  return authenticator.check(code, secret);
}

export function normalizeTotpCode(input: string) {
  return input.replace(/\s+/g, "").trim();
}

