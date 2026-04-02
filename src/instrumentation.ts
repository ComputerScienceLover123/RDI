export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const intervalMs = Number(process.env.ALERTS_CHECK_INTERVAL_MS || "0");
  if (!intervalMs || intervalMs < 60_000) return;

  const g = globalThis as typeof globalThis & { __rdiAlertsInterval?: ReturnType<typeof setInterval> };
  if (g.__rdiAlertsInterval) return;

  const tick = () => {
    void import("@/lib/alerts/runChecks")
      .then(({ runAlertChecks }) => runAlertChecks())
      .catch((err) => console.error("[alerts] scheduled check failed", err));
  };

  g.__rdiAlertsInterval = setInterval(tick, intervalMs);
  setTimeout(tick, 30_000);
}
