import type { UserRole } from "@prisma/client";

export type SessionRole = UserRole;

export type SessionClaims = {
  sub: string; // user id
  role: SessionRole;
  storeId: string | null;
  forcePasswordChange: boolean;
  typ: "session";
};

export type MfaPendingClaims = {
  sub: string; // user id
  typ: "mfa_pending";
};

