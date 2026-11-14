import { z } from "zod";
import { json, ProfileSchema, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { matchAll } from "@/lib/match";
import { getAllPolicies } from "@/lib/policies";

// 캐시가 만료된 직후에는 보조금24 전체(약 1.1만 건)를 다시 받느라 5~6초 걸린다. 배포 환경의 실행 시간 여유
export const maxDuration = 60;

// 공공 API는 이 서버 엔드포인트에서만 호출한다 (PRD 6-2)
export async function POST(req: Request) {
  const body = await readJson(req, z.object({ profile: ProfileSchema }));
  if ("response" in body) return body.response;

  const { policies, sources } = await getAllPolicies();
  const { results, counts } = matchAll(body.data.profile, policies);

  // 신청 가능 정책 중 금액이 숫자로 확인된 것만 더한다
  const eligibleAmount = results
    .filter((r) => r.status === "eligible" && r.policy.amountMax)
    .reduce((sum, r) => sum + (r.policy.amountMax ?? 0), 0);

  // 이미 누군가 만든 요약은 목록에서도 바로 보여준다 (새 요약은 버튼을 눌렀을 때만 생성)
  const rows = await prisma.policySummary.findMany({
    where: { policyId: { in: results.map((r) => r.policy.id) } },
    select: { policyId: true, target: true, amount: true, deadline: true, isAlwaysOpen: true },
  });
  const summaries = Object.fromEntries(rows.map(({ policyId, ...s }) => [policyId, s]));

  return json({ results, counts, eligibleAmount, sources, summaries });
}
