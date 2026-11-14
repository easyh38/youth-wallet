"use client";

import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { ButtonLink } from "./ui";

/** 로그인이 필요한 화면. 비로그인이면 안내를 보여준다 */
export function RequireLogin({ next, title, children }: { next: string; title: string; children: ReactNode }) {
  const { status } = useSession();
  if (status === "loading") return <div className="mx-auto max-w-[680px] px-4 py-12"><div className="skeleton h-10 w-1/2" /></div>;
  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex max-w-[420px] flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="display text-[24px]">{title}</h1>
        <p className="text-[15px] text-ink-muted">로그인하면 저장한 정책, 마감 알림, 서류 체크리스트를 볼 수 있어요.</p>
        <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} className="mt-2 w-full">로그인</ButtonLink>
        <ButtonLink href="/profile" variant="secondary" className="w-full">로그인 없이 지원금 찾기</ButtonLink>
      </div>
    );
  }
  return <>{children}</>;
}
