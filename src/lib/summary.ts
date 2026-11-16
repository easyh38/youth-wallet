import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "./db";
import { completeFactchat, factchatConfigured, reserveFactchatCall } from "./factchat";
import { isPublicFetchUrl } from "./security";
import type { Policy, Summary } from "./types";

// ─── PRD 6-4 시스템 프롬프트 ───
export const SYSTEM_PROMPT = `너는 한국 정부·지자체 지원 정책 공고문을 요약하는 도우미야.
1. 공고문에 적힌 내용만 사용하고, 추측하거나 지어내지 마.
2. 공고문에 없는 정보는 null로 둬.
3. 금액은 공고문에 적힌 단위 그대로 써.
4. 날짜는 YYYY-MM-DD 형식. 상시 모집이면 deadline은 null, isAlwaysOpen은 true.
5. 각 항목은 40자 이내.
6. 아래 JSON 형식으로만 답해.
{
  "target": "지원 대상 또는 null",
  "amount": "지원 금액 또는 null",
  "deadline": "YYYY-MM-DD 또는 null",
  "isAlwaysOpen": true/false,
  "documents": ["필요 서류1", "필요 서류2"],
  "applyMethod": "신청 방법 또는 null"
}`;

const nullableText = z
  .string()
  .nullable()
  .transform((v) => (v == null || /^(null|없음|-)?$/i.test(v.trim()) ? null : v.trim().slice(0, 60)));

export const SummarySchema = z.object({
  target: nullableText,
  amount: nullableText,
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .catch(null),
  isAlwaysOpen: z.boolean(),
  documents: z.array(z.string().min(1).max(60)).max(20).default([]),
  applyMethod: nullableText,
});

// ─── 입력 텍스트 만들기 ───

const MAX_INPUT = 12_000;
const PRIORITY = ["지원대상", "지원 대상", "신청자격", "지원내용", "지원 내용", "신청기간", "접수기간", "제출서류", "구비서류"];

/** 너무 길면 지원대상/지원내용/신청기간/제출서류 부분을 우선 남기고 자른다 */
export function trimInput(text: string, max = MAX_INPUT): string {
  if (text.length <= max) return text;
  const windows: [number, number][] = [];
  for (const kw of PRIORITY) {
    let i = text.indexOf(kw);
    while (i !== -1 && windows.length < 24) {
      windows.push([Math.max(0, i - 100), Math.min(text.length, i + 1500)]);
      i = text.indexOf(kw, i + kw.length);
    }
  }
  windows.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([...w]);
  }
  let out = merged.map(([a, b]) => text.slice(a, b)).join("\n…\n");
  if (out.length < max) out += "\n…\n" + text.slice(0, max - out.length);
  return out.slice(0, max);
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** 공개 https 주소만, 리다이렉트 없이, 10MB까지만 내려받는다 (SSRF·메모리 고갈 방지) */
async function downloadPdf(url: string): Promise<Uint8Array | null> {
  if (!isPublicFetchUrl(url)) return null;
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok || !res.body) return null;
  if (Number(res.headers.get("content-length") ?? 0) > MAX_PDF_BYTES) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PDF_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

async function pdfText(url: string): Promise<string> {
  try {
    const data = await downloadPdf(url);
    if (!data) return "";
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data });
    try {
      const r = await parser.getText();
      return r.text ?? "";
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    console.warn("[summary] PDF 텍스트 추출 실패:", (err as Error).message);
    return "";
  }
}

/** summaryRaw + 공고문 PDF 텍스트. HWP와 스캔본(글자 없음)은 summaryRaw만 쓴다 */
export async function buildInput(policy: Policy): Promise<string> {
  const parts = [`정책명: ${policy.title}`, `주관 기관: ${policy.agency}`, policy.summaryRaw];
  if (process.env.FACTCHAT_ACCEPTS_PDF !== "true") {
    for (const url of policy.attachmentUrls.filter((u) => /\.pdf($|\?)/i.test(u)).slice(0, 2)) {
      const t = (await pdfText(url)).trim();
      if (t.length > 50) parts.push(`[공고문]\n${t}`);
    }
  }
  return trimInput(parts.filter(Boolean).join("\n\n"));
}

export const hashInput = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

// ─── 팩트챗 호출 ───

async function callFactchat(input: string, policy: Policy): Promise<string> {
  const userContent =
    process.env.FACTCHAT_ACCEPTS_PDF === "true" && policy.attachmentUrls.length
      ? [{ type: "text" as const, text: input }, ...policy.attachmentUrls.slice(0, 2).map((url) => ({ type: "file" as const, file: { url } }))]
      : input;

  return completeFactchat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ]);
}

export function parseSummaryJson(text: string): Summary | null {
  const body = text.replace(/```(?:json)?/gi, "").trim();
  const start = body.indexOf("{"), end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const r = SummarySchema.safeParse(JSON.parse(body.slice(start, end + 1)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

// ─── 키가 없을 때: 규칙 기반 데모 요약 (원문에 있는 줄만 옮겨 적는다) ───

export function ruleSummary(policy: Policy, input: string): Summary {
  const line = (...labels: string[]) => {
    for (const l of labels) {
      const m = input.match(new RegExp(`${l}\\s*[:：]\\s*([^\\n]+)`));
      if (m) {
        // 괄호 속 부연 설명을 빼고, 그래도 40자를 넘으면 말줄임
        const t = m[1].replace(/\s*\([^)]*\)/g, "").trim();
        return t.length > 40 ? `${t.slice(0, 39).trim()}…` : t;
      }
    }
    return null;
  };
  const amountLine = line("지원내용", "지원 내용");
  const docs = line("제출서류", "구비서류");
  return {
    target: line("지원대상", "지원 대상", "신청자격"),
    amount: amountLine,
    deadline: policy.isAlwaysOpen ? null : policy.applyEnd,
    isAlwaysOpen: policy.isAlwaysOpen,
    documents: docs && !/없음/.test(docs)
      ? docs.split(/[,、]|및/).map((d) => d.replace(/\(.*?\)/g, "").trim()).filter((d) => d.length > 1).slice(0, 8)
      : [],
    applyMethod: line("신청방법", "신청 방법", "접수방법"),
  };
}

// ─── 캐시 확인 → 생성 → 저장 ───

export type SummaryResult = Summary & { engine: "factchat" | "rule"; cached: boolean; createdAt: string };

function fromRow(row: {
  target: string | null; amount: string | null; deadline: string | null; isAlwaysOpen: boolean;
  documents: string; applyMethod: string | null; engine: string; createdAt: Date;
}, cached: boolean): SummaryResult {
  return {
    target: row.target, amount: row.amount, deadline: row.deadline, isAlwaysOpen: row.isAlwaysOpen,
    documents: JSON.parse(row.documents) as string[], applyMethod: row.applyMethod,
    engine: row.engine === "rule" ? "rule" : "factchat", cached, createdAt: row.createdAt.toISOString(),
  };
}

/** 지금 정책 내용과 같은 입력으로 만든 요약이 이미 있으면 돌려준다 (새 호출 없음) */
export async function getFreshCachedSummary(policy: Policy): Promise<SummaryResult | null> {
  const engine = factchatConfigured() ? "factchat" : "rule";
  const row = await prisma.policySummary.findUnique({ where: { policyId: policy.id } });
  return row && row.sourceHash === sourceHashOf(policy, engine) ? fromRow(row, true) : null;
}

export async function getCachedSummary(policyId: string): Promise<SummaryResult | null> {
  const row = await prisma.policySummary.findUnique({ where: { policyId } });
  return row ? fromRow(row, true) : null;
}

const pending = new Map<string, Promise<SummaryResult>>();

export function getOrCreateSummary(policy: Policy): Promise<SummaryResult> {
  let p = pending.get(policy.id);
  if (!p) {
    p = createSummary(policy).finally(() => pending.delete(policy.id));
    pending.set(policy.id, p);
  }
  return p;
}

/** 입력이 바뀌었는지 보는 해시. PDF를 매번 내려받지 않도록 원본 설명 + 첨부 주소로 계산한다 */
export function sourceHashOf(policy: Policy, engine: string) {
  return hashInput([engine, policy.title, policy.summaryRaw, ...policy.attachmentUrls].join("\u0000"));
}

async function createSummary(policy: Policy): Promise<SummaryResult> {
  const engine = factchatConfigured() ? "factchat" : "rule";
  const sourceHash = sourceHashOf(policy, engine);

  // 정책 ID + 입력 해시가 같으면 모든 사용자가 같은 요약을 공유 (팩트챗 호출 없음)
  const existing = await prisma.policySummary.findUnique({ where: { policyId: policy.id } });
  if (existing && existing.sourceHash === sourceHash) return fromRow(existing, true);

  const input = await buildInput(policy);

  let summary: Summary | null;
  if (engine === "factchat") {
    await reserveFactchatCall();
    summary = parseSummaryJson(await callFactchat(input, policy));
    if (!summary) {
      // JSON 파싱 실패 시 1번만 다시 시도
      await reserveFactchatCall();
      summary = parseSummaryJson(await callFactchat(input, policy));
    }
    if (!summary) throw new Error("AI 요약 결과를 읽지 못했어요. 잠시 후 다시 시도해 주세요.");
  } else {
    summary = ruleSummary(policy, input);
  }

  const data = {
    sourceHash,
    target: summary.target,
    amount: summary.amount,
    deadline: summary.deadline,
    isAlwaysOpen: summary.isAlwaysOpen,
    documents: JSON.stringify(summary.documents),
    applyMethod: summary.applyMethod,
    engine,
  };
  const row = await prisma.policySummary.upsert({
    where: { policyId: policy.id },
    create: { policyId: policy.id, ...data },
    update: { ...data, createdAt: new Date() },
  });
  return fromRow(row, false);
}
