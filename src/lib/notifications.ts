// PRD 6-7 마감 임박 알림. 스케줄러(node-cron) 또는 /api/cron/deadlines 에서 호출한다.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dDay, kstDate } from "./date";
import type { Policy } from "./types";

const POINTS = [
  { days: 7, type: "D7", setting: "d7" },
  { days: 3, type: "D3", setting: "d3" },
  { days: 1, type: "D1", setting: "d1" },
] as const;

export function notificationMessage(title: string, days: number, remainingDocs: number, totalDocs: number) {
  const tail =
    totalDocs === 0 ? "공고문에서 서류를 확인하세요" : remainingDocs === 0 ? "서류 준비 완료!" : `서류 ${remainingDocs}개 남았어요`;
  return `${title} 마감 D-${days} · ${tail}`;
}

/**
 * 저장한 정책 중 마감일이 있고, 신청 완료가 아니며, 마감 전인 정책에 D-7/D-3/D-1 알림을 만든다.
 * 같은 정책·같은 시점 알림은 DB 고유 제약(userId, policyId, type)으로 한 번만 만들어진다.
 */
export async function runDeadlineCheck(today: string = kstDate()): Promise<{ checked: number; created: number }> {
  const todayStart = new Date(`${today}T00:00:00+09:00`);
  const targets = await prisma.savedPolicy.findMany({
    where: { status: "saved", deadline: { not: null, gte: todayStart } },
    include: { checklist: true, user: { include: { settings: true } } },
  });

  let created = 0;
  for (const sp of targets) {
    const deadline = kstDate(sp.deadline!);
    const days = dDay(deadline, today);
    const point = POINTS.find((p) => p.days === days);
    if (!point) continue;
    const settings = sp.user.settings;
    if (settings && !settings[point.setting]) continue;

    const already = await prisma.notification.findUnique({
      where: { userId_policyId_type: { userId: sp.userId, policyId: sp.policyId, type: point.type } },
      select: { id: true },
    });
    if (already) continue;

    const policy = JSON.parse(sp.snapshot) as Policy;
    const remaining = sp.checklist.filter((c) => !c.isChecked).length;
    try {
      await prisma.notification.create({
        data: {
          userId: sp.userId,
          policyId: sp.policyId,
          type: point.type,
          message: notificationMessage(policy.title, point.days, remaining, sp.checklist.length),
        },
      });
      created++;
    } catch (err) {
      // 이미 만든 알림(고유 제약 위반)은 건너뛴다
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  return { checked: targets.length, created };
}
