/** 로그인 뒤 이동할 곳은 이 사이트 안의 경로만 (//evil.com, /\evil.com 같은 오픈 리다이렉트 방지) */
export function safeNext(next: string | null, fallback = "/my"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://x.invalid");
    return u.origin === "http://x.invalid" ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}
