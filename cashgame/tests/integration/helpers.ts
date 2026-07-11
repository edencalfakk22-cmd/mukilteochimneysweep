import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import type { Actor } from "@/server/actor";
import type { Role } from "@prisma/client";

export const PASSWORDS = {
  owner: "Owner123!",
  manager: "Manager123!",
  operator: "Operator123!",
  viewer: "Viewer123!",
};

export interface TestWorld {
  orgId: string;
  owner: Actor;
  manager: Actor;
  operator: Actor;
  viewer: Actor;
}

export async function createWorld(): Promise<TestWorld> {
  const org = await prisma.organization.create({
    data: { name: "ארגון בדיקות" },
  });
  await prisma.appSetting.create({ data: { organizationId: org.id } });

  async function mkUser(name: string, username: string, password: string, role: Role, pin?: string) {
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        name,
        username,
        passwordHash: bcrypt.hashSync(password, 4),
        role,
        pinHash: pin ? bcrypt.hashSync(pin, 4) : null,
      },
    });
    const actor: Actor = { userId: user.id, organizationId: org.id, role, name };
    return actor;
  }

  return {
    orgId: org.id,
    owner: await mkUser("בעלים", "owner", PASSWORDS.owner, "OWNER", "1234"),
    manager: await mkUser("מנהל", "manager", PASSWORDS.manager, "MANAGER", "2345"),
    operator: await mkUser("מפעיל", "operator", PASSWORDS.operator, "OPERATOR", "3456"),
    viewer: await mkUser("צופה", "viewer", PASSWORDS.viewer, "VIEWER"),
  };
}

export async function createTestPlayer(orgId: string, fullName: string) {
  return prisma.player.create({ data: { organizationId: orgId, fullName } });
}

let keyCounter = 0;
export function idem(): string {
  return `test-key-${Date.now()}-${keyCounter++}`;
}

export const ILS = (n: number) => n * 100;
