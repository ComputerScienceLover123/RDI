import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RDI",
  description: "Custom auth + RBAC demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

