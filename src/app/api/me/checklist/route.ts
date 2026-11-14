import { z } from "zod";
import { error, json, readJson, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

/** 체크리스트 항목이 로그인한 본인 것인지 확인. 남의 것이면 403 */
async function ownItem(userId: string, id: string) {
  const item = await prisma.checklistItem.findUnique({ where: { id }, include: { savedPolicy: { select: { userId: true } } } });
  if (!item) return { response: error(404, "항목을 찾을 수 없어요") };
  if (item.savedPolicy.userId !== userId) return { response: error(403, "접근 권한이 없어요") };
  return { item };
}

// 서류 직접 추가
export async function POST(req: Request) {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const body = await readJson(req, z.object({ savedPolicyId: z.string(), name: z.string().trim().min(1, "서류 이름을 입력해 주세요").max(60) }));
  if ("response" in body) return body.response;

  const sp = await prisma.savedPolicy.findUnique({ where: { id: body.data.savedPolicyId }, select: { userId: true } });
  if (!sp) return error(404, "저장한 정책을 찾을 수 없어요");
  if (sp.userId !== me.userId) return error(403, "접근 권한이 없어요");

  const last = await prisma.checklistItem.findFirst({ where: { savedPolicyId: body.data.savedPolicyId }, orderBy: { order: "desc" } });
  const item = await prisma.checklistItem.create({
    data: { savedPolicyId: body.data.savedPolicyId, name: body.data.name, isCustom: true, order: (last?.order ?? -1) + 1 },
  });
  return json({ item }, 201);
}

// 체크 / 체크 해제
export async function PATCH(req: Request) {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const body = await readJson(req, z.object({ id: z.string(), isChecked: z.boolean() }));
  if ("response" in body) return body.response;

  const own = await ownItem(me.userId, body.data.id);
  if ("response" in own) return own.response;
  const item = await prisma.checklistItem.update({ where: { id: body.data.id }, data: { isChecked: body.data.isChecked } });
  return json({ item });
}

// 삭제: /api/me/checklist?id=...
export async function DELETE(req: Request) {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return error(400, "id가 필요해요");

  const own = await ownItem(me.userId, id);
  if ("response" in own) return own.response;
  await prisma.checklistItem.delete({ where: { id } });
  return json({ ok: true });
}
