import { NextResponse } from "next/server";
import { apiHandler, ok } from "@/server/api";
import { getDebtOverview } from "@/server/services/players";
import { debtReportPdf, debtReportXlsx, debtReportCsv } from "@/server/reports/builders";

export const GET = apiHandler(async (req, actor) => {
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const overview = await getDebtOverview(actor.organizationId);
  const data = {
    totalOpenDebt: overview.totalOpenDebt,
    rows: overview.rows.filter((r) => r.totalDebt > 0),
  };

  if (format === "pdf") {
    const buf = await debtReportPdf(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="debt-report.pdf"`,
      },
    });
  }
  if (format === "xlsx") {
    const buf = await debtReportXlsx(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="debt-report.xlsx"`,
      },
    });
  }
  if (format === "csv") {
    const buf = debtReportCsv(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="debt-report.csv"`,
      },
    });
  }
  return ok(data);
});
