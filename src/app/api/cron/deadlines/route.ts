import { createHash, timingSafeEqual } from "node:crypto";
import { error, json } from "@/lib/api";
import { runDeadlineCheck } from "@/lib/notifications";

const digest = (s: string) => createHash("sha256").update(s).digest();

// 함수 실행 시간 여유 (알림 대상이 많아도 끝까지 돌도록)
export const maxDuration = 60;

// Vercel Cron은 GET으로 부르고 CRON_SECRET 환경변수가 있으면 Authorization: Bearer <CRON_SECRET> 를 붙인다
export async function GET(req: Request) {
  return POST(req);
}

// 배포 플랫폼 cron 또는 수동 테스트용. Authorization: Bearer <CRON_SECRET>
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  // 길이가 달라도 같은 시간에 비교되도록 해시끼리 비교
  if (!secret || secret.length < 16 || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) {
    return error(401, "unauthorized");
  }
  const result = await runDeadlineCheck();
  return json(result);
}
