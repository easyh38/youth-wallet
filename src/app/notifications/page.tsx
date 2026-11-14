"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireLogin } from "@/components/require-login";
import { Badge, Button, cx, EmptyState, ErrorBox } from "@/components/ui";
import { api } from "@/lib/client";

type N = { id: string; policyId: string; type: "D7" | "D3" | "D1"; message: string; isRead: boolean; createdAt: string };

function NotificationList() {
  const router = useRouter();
  const [list, setList] = useState<N[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ notifications: N[] }>("/api/me/notifications").then((r) => setList(r.notifications)).catch((e) => setErr((e as Error).message));
  }, []);

  async function openOne(n: N) {
    if (!n.isRead) api("/api/me/notifications", { method: "PATCH", json: { ids: [n.id] } }).catch(() => {});
    router.push(`/policies/${encodeURIComponent(n.policyId)}`);
  }

  async function readAll() {
    await api("/api/me/notifications", { method: "PATCH", json: { all: true } });
    setList((l) => l?.map((n) => ({ ...n, isRead: true })) ?? null);
    router.refresh();
  }

  const unread = list?.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="mx-auto max-w-[680px] px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="display text-[28px]">알림</h1>
        {unread > 0 && <Button variant="ghost" onClick={readAll} className="-mr-3 text-sm">모두 읽음</Button>}
      </div>
      {err && <ErrorBox>{err}</ErrorBox>}
      {!list && !err && <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>}
      {list?.length === 0 && (
        <EmptyState title="아직 알림이 없어요" body="저장한 정책의 마감 7일·3일·1일 전 오전 9시에 알려 드려요." />
      )}
      <ul className="flex flex-col gap-2">
        {list?.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => openOne(n)}
              className={cx(
                "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-surface",
                n.isRead ? "border-line-soft" : "border-line bg-surface",
              )}
            >
              <span className={cx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", n.isRead ? "bg-line-soft text-ink-muted" : "bg-accent text-on-accent")}>
                <Bell size={17} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={cx("text-[15px]", !n.isRead && "font-semibold")}>{n.message}</span>
                <span className="flex items-center gap-2 text-[13px] text-ink-muted">
                  <Badge tone={n.type === "D7" ? "warn" : "urgent"} className="tnum">D-{n.type.slice(1)}</Badge>
                  {new Date(n.createdAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {!n.isRead && <span className="sr-only">읽지 않음</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequireLogin next="/notifications" title="알림">
      <NotificationList />
    </RequireLogin>
  );
}
