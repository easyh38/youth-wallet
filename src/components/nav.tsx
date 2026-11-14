"use client";

import { Bell, Bookmark, House, Search, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { cx } from "./ui";

const TABS = [
  { href: "/", label: "홈", icon: House, match: (p: string) => p === "/" },
  { href: "/policies", label: "찾기", icon: Search, match: (p: string) => p.startsWith("/policies") || p.startsWith("/profile") },
  { href: "/my", label: "내 정책", icon: Bookmark, match: (p: string) => p.startsWith("/my") },
  { href: "/notifications", label: "알림", icon: Bell, match: (p: string) => p.startsWith("/notifications") },
  { href: "/me", label: "내 정보", icon: User, match: (p: string) => p.startsWith("/me") },
];

function useUnread(enabled: boolean, pathname: string) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch("/api/me/notifications")
      .then((r) => (r.ok ? r.json() : { unread: 0 }))
      .then((d: { unread: number }) => alive && setUnread(d.unread))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, pathname]);
  return enabled ? unread : 0;
}

function UnreadDot({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="tnum absolute -top-1.5 left-1/2 ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-urgent px-1 text-[11px] font-bold text-white">
      <span className="sr-only">읽지 않은 알림 </span>
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AppNav() {
  const pathname = usePathname();
  const { status } = useSession();
  const loggedIn = status === "authenticated";
  const unread = useUnread(loggedIn, pathname);

  return (
    <>
      {/* 데스크톱·태블릿 상단 메뉴 */}
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 lg:px-6">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.02em]">
            <span aria-hidden className="inline-block h-5 w-5 rounded-md bg-accent ring-1 ring-ink/80" />
            청년지갑
          </Link>
          <nav aria-label="주요 메뉴" className="hidden items-center gap-1 lg:flex">
            {TABS.slice(1).map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={t.match(pathname) ? "page" : undefined}
                className={cx(
                  "relative rounded-full px-4 py-2 text-[15px] font-medium transition-colors",
                  t.match(pathname) ? "bg-ink text-paper" : "text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
                {t.href === "/notifications" && <UnreadDot n={unread} />}
              </Link>
            ))}
            {status === "unauthenticated" && (
              <Link href="/login" className="ml-2 rounded-full border border-line px-4 py-2 text-[15px] font-semibold hover:bg-surface">
                로그인
              </Link>
            )}
          </nav>
          {status === "unauthenticated" && (
            <Link href="/login" className="text-[15px] font-semibold lg:hidden">로그인</Link>
          )}
        </div>
      </header>

      {/* 모바일 하단 탭 바 */}
      <nav
        aria-label="하단 메뉴"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
          {TABS.map((t) => {
            const active = t.match(pathname);
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cx("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-ink" : "text-ink-muted")}
                >
                  <span className="relative">
                    <Icon size={22} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                    {t.href === "/notifications" && <UnreadDot n={unread} />}
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
