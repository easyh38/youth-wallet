import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";
import { clientIp, isPublicFetchUrl, rateLimit, safeHttpUrl } from "./security";

describe("safeNext", () => {
  it("사이트 안 경로는 그대로", () => {
    expect(safeNext("/policies/youth-1?x=1")).toBe("/policies/youth-1?x=1");
  });
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/%0d%0a", "/\tevil", null, ""])("막는다: %s", (v) => {
    expect(["/my", "/%0d%0a"]).toContain(safeNext(v));
  });
});

describe("safeHttpUrl", () => {
  it("http(s)는 그대로", () => {
    expect(safeHttpUrl("https://www.gov.kr/a?b=1", "x")).toBe("https://www.gov.kr/a?b=1");
  });
  it("javascript:, data: 는 대체 주소로", () => {
    expect(safeHttpUrl("javascript:alert(1)", "https://fallback")).toBe("https://fallback");
    expect(safeHttpUrl(" JaVaScRiPt:alert(1)", "https://fallback")).toBe("https://fallback");
    expect(safeHttpUrl("data:text/html,<script>", "https://fallback")).toBe("https://fallback");
    expect(safeHttpUrl("", "https://fallback")).toBe("https://fallback");
  });
});

describe("isPublicFetchUrl", () => {
  it("공개 https 주소만 허용", () => {
    expect(isPublicFetchUrl("https://www.youthcenter.go.kr/file.pdf")).toBe(true);
  });
  it.each([
    "http://www.example.com/a.pdf",
    "https://localhost/a.pdf",
    "https://127.0.0.1/a.pdf",
    "https://10.0.0.5/a.pdf",
    "https://192.168.0.1/a.pdf",
    "https://172.20.1.1/a.pdf",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/a.pdf",
    "https://intranet/a.pdf",
    "https://user:pw@example.com/a.pdf",
    "file:///etc/passwd",
  ])("막는다: %s", (url) => {
    expect(isPublicFetchUrl(url)).toBe(false);
  });
});

describe("rateLimit", () => {
  it("한도를 넘으면 막는다", () => {
    const key = `t-${Math.random()}`;
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    const third = rateLimit(key, 2, 60_000);
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
  });
});

describe("clientIp", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("플랫폼이 채우는 헤더를 사용자가 보낼 수 있는 x-forwarded-for보다 먼저 본다", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1", "x-vercel-forwarded-for": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
  });
  it("다른 헤더가 없으면 x-forwarded-for 첫 값, 그것도 없으면 local", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
    expect(clientIp(h({}))).toBe("local");
  });
});
