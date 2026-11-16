import "server-only";
import { kstDate } from "./date";
import { prisma } from "./db";

export class QuotaError extends Error {}

export function factchatConfigured() {
  return !!(process.env.FACTCHAT_API_URL && process.env.FACTCHAT_API_KEY && process.env.FACTCHAT_MODEL);
}

export async function reserveFactchatCall() {
  const date = kstDate();
  const dailyLimit = Math.max(1, Number(process.env.FACTCHAT_DAILY_LIMIT) || 1000);
  const limit = Math.floor(dailyLimit * 0.9);
  if (Number.isSafeInteger(limit) && limit > 0) {
    // 정책 요약과 도우미가 여러 서버에서 동시에 호출해도 한도를 공유한다.
    const updated = await prisma.$executeRaw`
      INSERT INTO "ApiUsage" ("date", "count") VALUES (${date}, 1)
      ON CONFLICT ("date") DO UPDATE SET "count" = "ApiUsage"."count" + 1
      WHERE "ApiUsage"."count" < ${limit}
    `;
    if (updated) return;
  }
  throw new QuotaError("오늘 AI 요약 한도에 거의 도달했어요. 원문에서 내용을 확인해 주세요.");
}

type FactchatPart = { type: "text"; text: string } | { type: "file"; file: { url: string } };
type FactchatMessage = { role: "system" | "user"; content: string | FactchatPart[] };

export async function completeFactchat(messages: FactchatMessage[], signal = AbortSignal.timeout(30_000)): Promise<string> {
  const header = process.env.FACTCHAT_AUTH_HEADER || "Authorization";
  const prefix = process.env.FACTCHAT_AUTH_PREFIX ?? "Bearer ";
  const res = await fetch(process.env.FACTCHAT_API_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json", [header]: `${prefix}${process.env.FACTCHAT_API_KEY}` },
    body: JSON.stringify({ model: process.env.FACTCHAT_MODEL, temperature: 0.1, messages }),
    signal,
  });
  if (!res.ok) throw new Error(`FactChat HTTP ${res.status}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    output_text?: string;
    content?: { text?: string }[];
  };
  return json.choices?.[0]?.message?.content ?? json.output_text ?? json.content?.[0]?.text ?? "";
}
