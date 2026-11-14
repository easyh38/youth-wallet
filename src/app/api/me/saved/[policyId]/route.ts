import { z } from "zod";
import { error, json, readJson, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getPolicyById } from "@/lib/policies";
import { rateLimit } from "@/lib/security";
import { getCachedSummary, getOrCreateSummary } from "@/lib/summary";

type Ctx = { params: Promise<{ policyId: string }> };

// 저장: 정책 정보를 통째로 복사해 두고, AI 요약의 서류 목록으로 체크리스트를 만든다
export async function POST(_req: Request, { params }: Ctx) {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const { policyId } = await params;

  const existing = await prisma.savedPolicy.findUnique({ where: { userId_policyId: { userId: me.userId, policyId } } });
  if (existing) return json({ saved: existing });

  // 저장할 때 요약을 새로 만들 수 있으므로 사용자당 1시간 60회로 제한
  if (!rateLimit(`save:${me.userId}`, 60, 60 * 60_000).ok) return error(429, "잠시 후 다시 시도해 주세요");

  const policy = await getPolicyById(policyId);
  if (!policy) return error(404, "정책을 찾을 수 없어요");

  // 요약이 없으면 저장할 때 만든다. 한도 초과 등으로 실패하면 빈 체크리스트로 시작
  let documents: string[] = [];
  try {
    documents = ((await getCachedSummary(policyId)) ?? (await getOrCreateSummary(policy))).documents;
  } catch {
    documents = [];
  }

  try {
    const saved = await prisma.savedPolicy.create({
      data: {
        userId: me.userId,
        policyId,
        snapshot: JSON.stringify(policy),
        deadline: policy.applyEnd && !policy.isAlwaysOpen ? new Date(`${policy.applyEnd}T00:00:00+09:00`) : null,
        checklist: { create: documents.map((name, order) => ({ name, order })) },
      },
      include: { checklist: true },
    });
    return json({ saved }, 201);
  } catch {
    // 동시에 두 번 누른 경우
    const again = await prisma.savedPolicy.findUnique({ where: { userId_policyId: { userId: me.userId, policyId } } });
    return again ? json({ saved: again }) : error(500, "저장하지 못했어요");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const { policyId } = await params;
  await prisma.savedPolicy.deleteMany({ where: { userId: me.userId, policyId } });
  return json({ ok: true });
}

// 신청 완료 표시 / 되돌리기
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await requireUser();
  if ("response" in me) return me.response;
  const { policyId } = await params;
  const body = await readJson(req, z.object({ status: z.enum(["saved", "applied"]) }));
  if ("response" in body) return body.response;

  const r = await prisma.savedPolicy.updateMany({
    where: { userId: me.userId, policyId },
    data: { status: body.data.status },
  });
  if (r.count === 0) return error(404, "저장한 정책이 아니에요");
  return json({ ok: true, status: body.data.status });
}
