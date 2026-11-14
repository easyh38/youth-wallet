// 완료 기준 확인: D-3 테스트 정책으로 스케줄러를 실행하면 알림이 1개만 만들어진다.
// 실행: npm run test:notify
import { addDays, kstDate } from "../src/lib/date";
import { prisma } from "../src/lib/db";
import { runDeadlineCheck } from "../src/lib/notifications";

async function main() {
  const email = `notify-test-${Date.now()}@example.test`;
  const today = kstDate();
  const deadline = addDays(today, 3);

  const user = await prisma.user.create({
    data: { email, passwordHash: "x", settings: { create: {} } },
  });
  try {
    await prisma.savedPolicy.create({
      data: {
        userId: user.id,
        policyId: "test-D3",
        snapshot: JSON.stringify({ id: "test-D3", title: "청년월세 특별지원(테스트)", applyEnd: deadline }),
        deadline: new Date(`${deadline}T00:00:00+09:00`),
        checklist: { create: [{ name: "임대차계약서", order: 0, isChecked: true }, { name: "가족관계증명서", order: 1 }] },
      },
    });

    const first = await runDeadlineCheck(today);
    const second = await runDeadlineCheck(today); // 같은 날 두 번 실행해도 중복 없음
    const list = await prisma.notification.findMany({ where: { userId: user.id } });

    console.log("1차 실행:", first, "/ 2차 실행:", second);
    console.log("만들어진 알림:", list.map((n) => `${n.type} ${n.message}`));
    if (list.length !== 1 || list[0].type !== "D3") throw new Error(`알림이 1개(D3)여야 하는데 ${list.length}개예요`);
    console.log("✅ 통과: D-3 알림이 정확히 1개 만들어졌어요");
  } finally {
    await prisma.user.delete({ where: { id: user.id } }); // cascade로 테스트 데이터 정리
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
