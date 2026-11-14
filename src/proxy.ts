import { NextResponse, type NextRequest } from "next/server";

/**
 * 상태를 바꾸는 API 요청(POST/PUT/PATCH/DELETE)은 같은 사이트에서 온 것만 받는다. (CSRF 방어 보강)
 * - 세션 쿠키가 SameSite=Lax 라 기본 방어가 되지만, 브라우저·서브도메인 차이에 대비해 Origin도 확인한다.
 * - /api/auth 는 Auth.js 가 자체 CSRF 토큰으로 막고, /api/cron 은 서버 간 호출이라 비밀값으로 막는다.
 */
export function proxy(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/cron/")) return NextResponse.next();

  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let sameOrigin = false;
  try {
    sameOrigin = !!origin && !!host && new URL(origin).host === host;
  } catch {
    sameOrigin = false;
  }
  // fetch()는 같은 출처 요청에도 Origin을 보내므로, Origin이 없거나 다르면 거절
  if (!sameOrigin) {
    return NextResponse.json({ error: "허용되지 않은 요청이에요" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
