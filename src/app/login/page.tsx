import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24, maxWidth: 520 }}>Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}
