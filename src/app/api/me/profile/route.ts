import { json, profileFromRow, ProfileSchema, readJson, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const row = await prisma.profile.findUnique({ where: { userId: me.userId } });
  return json({ profile: row ? profileFromRow(row) : null, updatedAt: row?.updatedAt ?? null });
}

export async function PUT(req: Request) {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const body = await readJson(req, ProfileSchema);
  if ("response" in body) return body.response;

  const data = { ...body.data, interests: JSON.stringify(body.data.interests) };
  const row = await prisma.profile.upsert({
    where: { userId: me.userId },
    create: { userId: me.userId, ...data },
    update: data,
  });
  return json({ profile: profileFromRow(row), updatedAt: row.updatedAt });
}
