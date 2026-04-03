import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { reportId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";

  const r = await prisma.hqGeneratedReport.findUnique({ where: { id: params.reportId } });
  if (!r || r.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Not found or expired" }, { status: 404 });
  }

  const rel = format === "pdf" ? r.pdfRelPath : r.csvRelPath;
  const abs = path.join(process.cwd(), rel);
  try {
    const buf = await fs.readFile(abs);
    const mime = format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8";
    const ext = format === "pdf" ? "pdf" : "csv";
    const safe = r.displayName.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${safe}.${ext}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
