import { z } from "zod";
import { json, readJson, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const notifications = await prisma.notification.findMany({
    where: { userId: me.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json({ notifications, unread: notifications.filter((n) => !n.isRead).length });
}

// 읽음 처리: { ids: [...] } 또는 { all: true }
export async function PATCH(req: Request) {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const body = await readJson(req, z.object({ ids: z.array(z.string()).max(100).optional(), all: z.boolean().optional() }));
  if ("response" in body) return body.response;

  const where = body.data.all
    ? { userId: me.userId, isRead: false }
    : { userId: me.userId, id: { in: body.data.ids ?? [] } };
  const r = await prisma.notification.updateMany({ where, data: { isRead: true } });
  return json({ updated: r.count });
}
