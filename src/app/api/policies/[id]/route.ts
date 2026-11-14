import { auth } from "@/auth";
import { error, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getPolicyById } from "@/lib/policies";
import { getCachedSummary } from "@/lib/summary";
import type { Policy } from "@/lib/types";

// 정책 상세: 정책 정보 + 이미 만들어진 요약(있으면) + 내 저장 상태
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  const saved = userId
    ? await prisma.savedPolicy.findUnique({
        where: { userId_policyId: { userId, policyId: id } },
        include: { checklist: { orderBy: { order: "asc" } } },
      })
    : null;

  // 원본이 사라져도 저장한 정책은 저장 시점 스냅샷으로 보여준다
  const policy = (await getPolicyById(id)) ?? (saved ? (JSON.parse(saved.snapshot) as Policy) : null);
  if (!policy) return error(404, "정책을 찾을 수 없어요");

  const summary = await getCachedSummary(id);
  return json({
    policy,
    summary,
    saved: saved && { id: saved.id, status: saved.status, checklist: saved.checklist },
  });
}
