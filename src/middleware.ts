import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "./lib/env";
import { jwtVerify } from "jose";

const secretBytes = new TextEncoder().encode(env.JWT_SECRET);

async function getJwtPayload(req: NextRequest) {
  const token = req.cookies.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const { payload } = await jwtVerify(token, secretBytes, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });

  if (payload.typ !== "session") return null;
  return payload;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const protectedPrefixes: Array<{
    prefix: string;
    requireRole?: "admin" | "manager" | "employee" | "any";
  }> = [
    { prefix: "/admin", requireRole: "admin" },
    { prefix: "/account", requireRole: "any" },
    { prefix: "/password-change", requireRole: "any" },
    { prefix: "/store", requireRole: "any" },
  ];

  const rule = protectedPrefixes.find((p) => pathname.startsWith(p.prefix));
  if (!rule) return NextResponse.next();

  try {
    const payload = await getJwtPayload(req);
    if (!payload) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    const role = payload.role as string | undefined;
    if (rule.requireRole === "admin" && role !== "admin") {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
  } catch {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/password-change", "/store/:path*"],
};

