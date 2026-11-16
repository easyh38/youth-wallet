import { z } from "zod";
import { auth } from "@/auth";
import { error, json, profileFromRow, ProfileSchema, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getAllPolicies, getPolicyById } from "@/lib/policies";
import { clientIp, rateLimit } from "@/lib/security";
import type { Policy } from "@/lib/types";
import { assistantReply, assistantTopic, type AssistantContext } from "@/lib/wallet-assistant";
import { explainPolicyEvidence } from "@/lib/wallet-assistant-explanation";

const detailPath = /^\/policies\/([^/?#\\\s]+)$/u;
const policyId = /^[^/?#\\\s\p{Cc}]+$/u;
const bodySchema = z.object({
  message: z.string().trim().min(1, "궁금한 내용을 입력해 주세요").max(500),
  previousQuestion: z.string().trim().min(1).max(500).optional(),
  pathname: z.union([
    z.enum(["/", "/profile", "/policies", "/my", "/notifications", "/me", "/login", "/signup"]),
    z.string().max(768).regex(detailPath),
  ]),
  policyQuery: z.object({
    category: z.enum(["housing", "scholarship", "job", "startup", "welfare", "etc"]).optional(),
    search: z.string().trim().max(200).optional(),
    selectedPolicyId: z.string().max(240).regex(policyId).optional(),
    status: z.enum(["eligible", "check"]).optional(),
    sources: z.array(z.enum(["youth", "gov24", "kosaf"])).max(3).optional(),
    interests: z.boolean().optional(),
  }).optional(),
  guestProfile: ProfileSchema.nullish().catch(undefined),
});

export const maxDuration = 60;

function requestedPolicyId(pathname: string) {
  const segment = detailPath.exec(pathname)?.[1];
  if (!segment) return undefined;
  try {
    const id = decodeURIComponent(segment);
    return id.length <= 240 && policyId.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

async function accountProfile(userId: string) {
  const row = await prisma.profile.findUnique({ where: { userId } });
  return row ? profileFromRow(row) : null;
}

async function getSavedContext(userId: string) {
  const rows = await prisma.savedPolicy.findMany({
    where: { userId },
    orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
    select: { snapshot: true, status: true },
  });
  return rows.map(({ snapshot, status }) => ({ policy: JSON.parse(snapshot) as Policy, status }));
}

async function getNotificationContext(userId: string) {
  const [unread, recent] = await Promise.all([
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { policyId: true, message: true, isRead: true },
      take: 5,
    }),
  ]);
  return { unread, recent };
}

export async function POST(req: Request) {
  const limit = rateLimit(`assistant:${clientIp(req.headers)}`, 20, 60_000);
  if (!limit.ok) return json({ error: "요청이 많아요. 잠시 뒤 다시 시도해 주세요." }, {
    status: 429, headers: { "Retry-After": String(limit.retryAfter) },
  });

  const body = await readJson(req, bodySchema);
  if ("response" in body) return body.response;

  const { message, previousQuestion, pathname, guestProfile } = body.data;
  const policyQuery = pathname === "/policies" ? body.data.policyQuery : undefined;
  const topic = assistantTopic(message, { pathname }, previousQuestion);

  try {
    const userId = (await auth())?.user?.id;
    const context: AssistantContext = { pathname, profile: null, policies: [], sampleSources: [], policyQuery, signedIn: !!userId };
    if (topic === "policies") {
      const [catalog, profile] = await Promise.all([
        getAllPolicies(),
        userId ? accountProfile(userId) : guestProfile ?? null,
      ]);
      context.profile = profile;
      context.policies = catalog.policies;
      context.sampleSources = catalog.sources.filter((source) => source.isSample).map((source) => source.source);
      context.unavailableSources = catalog.sources.filter((source) => !source.ok).map((source) => source.source);
      const id = requestedPolicyId(pathname) ?? policyQuery?.selectedPolicyId;
      if (id) {
        const current = catalog.policies.find((policy) => policy.id === id) ?? await getPolicyById(id);
        const saved = !current && userId ? await prisma.savedPolicy.findUnique({
          where: { userId_policyId: { userId, policyId: id } }, select: { snapshot: true },
        }) : null;
        context.selectedPolicy = current ?? (saved ? JSON.parse(saved.snapshot) as Policy : undefined);
      }
    } else if (userId && topic === "saved") {
      context.saved = await getSavedContext(userId).catch(() => undefined);
    } else if (userId && topic === "notifications") {
      context.notifications = await getNotificationContext(userId).catch(() => undefined);
    }

    const result = assistantReply(message, context, previousQuestion);
    const publicEvidence = result.evidence.filter(({ id }) => context.policies.some((policy) => policy.id === id));
    const explanation = await explainPolicyEvidence(publicEvidence, req.signal);
    return json({ answer: result.answer, policies: result.policies, links: result.links, explanation: explanation ?? undefined }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("[assistant] 요청 처리 실패", err instanceof Error ? err.name : "unknown");
    return error(503, "지금은 정책 정보를 불러오기 어려워요. 잠시 뒤 다시 시도해 주세요.");
  }
}
