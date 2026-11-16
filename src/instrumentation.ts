// 서버가 켜질 때 한 번 실행된다. 매일 오전 9시(한국 시간) 마감 임박 알림을 만든다.
// Vercel에서는 서버가 계속 켜져 있지 않아 node-cron이 동작하지 않으므로 Vercel Cron(vercel.json)을 쓴다.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENABLE_CRON === "false" || process.env.VERCEL) return;

  const g = globalThis as unknown as { __deadlineCron?: boolean };
  if (g.__deadlineCron) return;
  g.__deadlineCron = true;

  const cron = (await import("node-cron")).default;
  const { runDeadlineCheck } = await import("./lib/notifications");
  cron.schedule(
    "0 9 * * *",
    async () => {
      try {
        const r = await runDeadlineCheck();
        console.log(`[cron] 마감 알림 검사 완료: 대상 ${r.checked}건, 새 알림 ${r.created}건`);
        const { warmSources } = await import("./lib/policies");
        console.log("[cron] 정책 캐시 미리 받기:", await warmSources());
      } catch (err) {
        console.error("[cron] 마감 알림 검사 실패:", (err as Error).message);
      }
    },
    { timezone: "Asia/Seoul" },
  );
  console.log("[cron] 매일 09:00(KST) 마감 알림 스케줄러 시작");
}
