import { json, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import type { Policy } from "@/lib/types";

export async function GET() {
  const me = await requireUser();
  if ("response" in me) return me.response;

  const rows = await prisma.savedPolicy.findMany({
    where: { userId: me.userId },
    include: { checklist: { orderBy: { order: "asc" } } },
    orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
  });

  return json({
    saved: rows.map((r) => ({
      id: r.id,
      policyId: r.policyId,
      status: r.status,
      createdAt: r.createdAt,
      policy: JSON.parse(r.snapshot) as Policy,
      checklist: r.checklist,
    })),
  });
}
