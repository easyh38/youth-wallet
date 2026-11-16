import { error, json } from "@/lib/api";
import { QuotaError } from "@/lib/factchat";
import { getPolicyById } from "@/lib/policies";
import { clientIp, rateLimit } from "@/lib/security";
import { getFreshCachedSummary, getOrCreateSummary } from "@/lib/summary";

// "3줄 요약 보기"를 눌렀을 때만 호출된다. 캐시가 있으면 팩트챗을 부르지 않는다.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const policy = await getPolicyById(id);
  if (!policy) return error(404, "정책을 찾을 수 없어요");

  try {
    // 이미 만든 요약은 제한 없이 바로 돌려주고, 새로 만드는 요약만 IP당 10분에 15회로 제한한다
    // (비로그인 사용자가 정책을 돌아가며 요청해 학교 팩트챗 한도를 소진하는 것을 막는다)
    let summary = await getFreshCachedSummary(policy);
    if (!summary) {
      const limit = rateLimit(`summary:${clientIp(req.headers)}`, 15, 10 * 60_000);
      if (!limit.ok) {
        return error(429, `요약 요청이 너무 많아요. ${Math.ceil(limit.retryAfter / 60)}분 뒤에 다시 시도해 주세요.`);
      }
      summary = await getOrCreateSummary(policy);
    }
    // 마감일은 API 원본을 우선한다
    const deadlineMismatch = !!summary.deadline && !!policy.applyEnd && summary.deadline !== policy.applyEnd;
    return json({ summary, deadlineMismatch });
  } catch (err) {
    if (err instanceof QuotaError) return error(429, err.message);
    console.error("[summary] 실패:", id, (err as Error).message);
    return error(502, "요약을 만들지 못했어요. 원문에서 내용을 확인해 주세요.");
  }
}
