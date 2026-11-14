// 보안 보조 함수: 안전한 링크, SSRF 방지, 간단한 요청 제한
import { isIP } from "node:net";

/** 외부 데이터에서 온 링크는 http(s)만 허용한다. javascript:, data: 등은 막는다 */
export function safeHttpUrl(raw: string | null | undefined, fallback: string): string {
  try {
    const u = new URL(String(raw ?? "").trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : fallback;
  } catch {
    return fallback;
  }
}

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/**
 * 서버가 대신 내려받는 주소(공고문 PDF)는 공개 https 주소만 허용한다.
 * localhost, 사설망 IP, 내부 호스트 이름을 막아 SSRF를 방지한다.
 */
export function isPublicFetchUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  const v = isIP(host);
  if (v === 4) return !PRIVATE_V4.some((re) => re.test(host));
  if (v === 6) return false; // IPv6 리터럴은 허용하지 않는다
  return true;
}

/** 프로세스 메모리 안의 고정 창 요청 제한. 서버 1대 기준(학습용) */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  return { ok: b.count <= limit, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}

/** 요청자 IP (프록시 뒤라면 첫 번째 X-Forwarded-For) */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
