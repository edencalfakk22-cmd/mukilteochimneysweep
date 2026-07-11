import { NextResponse } from "next/server";
import { apiHandler, ok } from "@/server/api";
import { prisma } from "@/server/db";
import { buildSessionReportData } from "@/server/services/sessions";
import { sessionReportPdf, sessionReportXlsx, sessionReportCsv } from "@/server/reports/builders";
import type { Tx } from "@/server/db";

export const GET = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const report = await buildSessionReportData(prisma as unknown as Tx, actor.organizationId, id);

  // Closing snapshots for closed sessions (immutable history).
  const snapshots = await prisma.closingSnapshot.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "asc" },
    include: { createdBy: { select: { name: true } } },
  });

  const filename = `session-report-${id}`;
  if (format === "pdf") {
    const buf = await sessionReportPdf(report);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}.pdf"`,
      },
    });
  }
  if (format === "xlsx") {
    const buf = await sessionReportXlsx(report);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }
  if (format === "csv") {
    const buf = sessionReportCsv(report);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }
  return ok({
    report,
    snapshots: snapshots.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      createdByName: s.createdBy.name,
      reason: s.reason,
    })),
  });
});
