"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ProgramRow = {
  programId: string;
  programName: string;
  manufacturerName: string;
  paymentFrequency: string;
  enrolledProductCount: number;
  storeUnits30d: number;
  storeEstimatedRebate30d: string;
};

export default function StoreScanDataClient(props: { storeId: string; storeName: string }) {
  const { storeId, storeName } = props;
  const [loading, setLoading] = useState(true);
  const [windowLabel, setWindowLabel] = useState("");
  const [total, setTotal] = useState("");
  const [programs, setPrograms] = useState<ProgramRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/store/${encodeURIComponent(storeId)}/scan-data/summary`, {
      credentials: "include",
    });
    const j = await r.json().catch(() => null);
    if (r.ok) {
      setWindowLabel(`${j.windowStart} → ${j.windowEnd}`);
      setTotal(j.storeTotalEstimatedRebate30d ?? "0");
      setPrograms(j.programs ?? []);
    }
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <Link href={`/store/${encodeURIComponent(storeId)}`} style={{ color: "#2563eb" }}>
        ← Store home
      </Link>
      <h1 style={{ marginTop: 16 }}>Scan data — {storeName}</h1>
      <p style={{ opacity: 0.85 }}>
        Read-only summary of active manufacturer programs and estimated rebate from this location’s POS sales (
        {windowLabel}). HQ configures programs and submissions.
      </p>

      {loading ? <p>Loading…</p> : null}

      {!loading ? (
        <>
          <p style={{ fontSize: 18, fontWeight: 700 }}>Estimated rebate (30d): ${total}</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 16 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: 8 }}>Program</th>
                <th style={{ padding: 8 }}>Manufacturer</th>
                <th style={{ padding: 8 }}>Frequency</th>
                <th style={{ padding: 8 }}>UPCs in program</th>
                <th style={{ padding: 8 }}>Units (store)</th>
                <th style={{ padding: 8 }}>Est. rebate</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.programId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: 8 }}>{p.programName}</td>
                  <td style={{ padding: 8 }}>{p.manufacturerName}</td>
                  <td style={{ padding: 8 }}>{p.paymentFrequency}</td>
                  <td style={{ padding: 8 }}>{p.enrolledProductCount}</td>
                  <td style={{ padding: 8 }}>{p.storeUnits30d}</td>
                  <td style={{ padding: 8 }}>${p.storeEstimatedRebate30d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
