import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>RDI</h1>
      <p>
        <Link href="/login">Login</Link>
      </p>
    </main>
  );
}

