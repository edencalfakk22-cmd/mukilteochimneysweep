import { apiHandler, parseBody, ok } from "@/server/api";
import { playerCreateSchema } from "@/server/schemas";
import { createPlayer, searchPlayers } from "@/server/services/players";

export const GET = apiHandler(async (req, actor) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "1";
  const players = await searchPlayers(actor.organizationId, q, { activeOnly });
  return ok({
    players: players.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      nickname: p.nickname,
      phone: p.phone,
      isActive: p.isActive,
      currentDebt: p.currentDebt,
      currentCredit: p.currentCredit,
      creditLimit: p.creditLimit,
    })),
  });
});

export const POST = apiHandler(async (req, actor) => {
  const body = await parseBody(req, playerCreateSchema);
  const player = await createPlayer(actor, body);
  return ok({ player }, { status: 201 });
});
