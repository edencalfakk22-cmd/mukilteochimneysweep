import { NextResponse } from "next/server";
import { apiHandler, ok } from "@/server/api";
import { getPlayerProfile } from "@/server/services/players";
import { playerStatementPdf, playerStatementXlsx } from "@/server/reports/builders";

export const GET = apiHandler<{ id: string }>(async (req, actor, { id }) => {
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const profile = await getPlayerProfile(actor.organizationId, id);

  const data = {
    player: {
      fullName: profile.player.fullName,
      nickname: profile.player.nickname,
      phone: profile.player.phone,
    },
    currentDebt: profile.player.currentDebt,
    currentCredit: profile.player.currentCredit,
    transactions: profile.transactions.map((t) => ({
      createdAt: t.createdAt,
      type: t.type,
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      status: t.status,
      sessionName: t.sessionName,
      notes: t.notes,
    })),
  };

  const filename = `player-statement-${id}`;
  if (format === "pdf") {
    const buf = await playerStatementPdf(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}.pdf"`,
      },
    });
  }
  if (format === "xlsx") {
    const buf = await playerStatementXlsx(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }
  return ok(data);
});
