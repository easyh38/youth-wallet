import { z } from "zod";
import { json, ProfileSchema, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { eligibleAmountOf, matchAll } from "@/lib/match";
import { getAllPolicies } from "@/lib/policies";

// 캐시가 만료된 직후에는 보조금24 전체(약 1.1만 건)를 다시 받느라 5~6초 걸린다. 배포 환경의 실행 시간 여유
export const maxDuration = 60;

// 공공 API는 이 서버 엔드포인트에서만 호출한다 (PRD 6-2)
export async function POST(req: Request) {
  const body = await readJson(req, z.object({ profile: ProfileSchema }));
  if ("response" in body) return body.response;

  const { policies, sources } = await getAllPolicies();
  const { results, counts } = matchAll(body.data.profile, policies);

  const eligibleAmount = eligibleAmountOf(results);

  // 이미 누군가 만든 요약은 목록에서도 바로 보여준다 (새 요약은 버튼을 눌렀을 때만 생성)
  const rows = await prisma.policySummary.findMany({
    where: { policyId: { in: results.map((r) => r.policy.id) } },
    select: { policyId: true, target: true, amount: true, deadline: true, isAlwaysOpen: true },
  });
  const summaries = Object.fromEntries(rows.map(({ policyId, ...s }) => [policyId, s]));

  // 항목별 상세·링크는 상세 화면에서만 쓰므로 목록 응답에서는 뺀다 (응답 크기 절약)
  const light = results.map((r) => ({ ...r, policy: { ...r.policy, details: undefined, links: undefined } }));
  return json({ results: light, counts, eligibleAmount, sources, summaries });
}
