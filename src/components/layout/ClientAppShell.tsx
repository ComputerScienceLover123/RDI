"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import AppHeader, { type HeaderUser } from "./AppHeader";

export default function ClientAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<HeaderUser | null | undefined>(undefined);

  useEffect(() => {
    void fetch("/api/auth/session", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null));
  }, [pathname]);

  const hideChrome =
    pathname === "/login" ||
    pathname === "/password-change" ||
    pathname?.startsWith("/login") ||
    pathname === "/unauthorized";

  if (user === undefined) {
    return <>{children}</>;
  }

  return (
    <>
      {!hideChrome && user ? <AppHeader user={user} /> : null}
      {children}
    </>
  );
}
