import { z } from "zod";
import { json, readJson, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

const SettingsSchema = z.object({ d7: z.boolean(), d3: z.boolean(), d1: z.boolean(), emailOn: z.boolean() });

export async function GET() {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const s = await prisma.notificationSetting.upsert({ where: { userId: me.userId }, create: { userId: me.userId }, update: {} });
  return json({ settings: { d7: s.d7, d3: s.d3, d1: s.d1, emailOn: s.emailOn } });
}

export async function PUT(req: Request) {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const body = await readJson(req, SettingsSchema);
  if ("response" in body) return body.response;
  const s = await prisma.notificationSetting.upsert({
    where: { userId: me.userId },
    create: { userId: me.userId, ...body.data },
    update: body.data,
  });
  return json({ settings: { d7: s.d7, d3: s.d3, d1: s.d1, emailOn: s.emailOn } });
}
