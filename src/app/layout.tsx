import type { Metadata } from "next";
import ClientAppShell from "@/components/layout/ClientAppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "RDI",
  description: "Custom auth + RBAC demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientAppShell>{children}</ClientAppShell>
      </body>
    </html>
  );
}

