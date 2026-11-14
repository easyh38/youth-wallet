import { json, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

// 회원 탈퇴: 프로필·저장 정책·체크리스트·알림·설정까지 모두 삭제 (onDelete: Cascade)
export async function DELETE() {
  const me = await requireUser();
  if ("response" in me) return me.response;
  await prisma.user.delete({ where: { id: me.userId } });
  return json({ ok: true });
}
