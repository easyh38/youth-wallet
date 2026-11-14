"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Checklist, type ChecklistItemT } from "@/components/checklist";
import { RequireLogin } from "@/components/require-login";
import { Badge, Button, ButtonLink, Card, cx, DdayBadge, EmptyState, ErrorBox, Progress, SourceBadge } from "@/components/ui";
import { api } from "@/lib/client";
import { ddayInfo } from "@/lib/format";
import type { Policy } from "@/lib/types";

type Saved = { id: string; policyId: string; status: "saved" | "applied"; policy: Policy; checklist: ChecklistItemT[] };
type Tab = "active" | "applied" | "closed";

function tabOf(s: Saved): Tab {
  if (s.status === "applied") return "applied";
  const d = ddayInfo(s.policy.applyEnd, s.policy.isAlwaysOpen);
  return d.tone === "closed" ? "closed" : "active"; // 마감일이 지나면 자동으로 마감됨 탭
}

function SavedItem({ s, onUpdate, onRemove }: { s: Saved; onUpdate: (s: Saved) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dd = ddayInfo(s.policy.applyEnd, s.policy.isAlwaysOpen);
  const done = s.checklist.filter((c) => c.isChecked).length;

  async function setStatus(status: Saved["status"]) {
    setBusy(true);
    try {
      await api(`/api/me/saved/${encodeURIComponent(s.policyId)}`, { method: "PATCH", json: { status } });
      onUpdate({ ...s, status });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/me/saved/${encodeURIComponent(s.policyId)}`, { method: "DELETE" });
      onRemove();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap gap-1.5">
        <DdayBadge {...dd} />
        <SourceBadge source={s.policy.source} />
        {s.status === "applied" && <Badge tone="ok">✓ 신청 완료</Badge>}
      </div>
      <Link href={`/policies/${encodeURIComponent(s.policyId)}`} className="group flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold tracking-[-0.01em] group-hover:underline group-hover:underline-offset-4">{s.policy.title}</h3>
          <p className="mt-1 text-[13px] text-ink-muted">{s.policy.agency}</p>
        </div>
        <ChevronRight size={20} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
      </Link>

      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex flex-col gap-2 text-left">
        <span className="tnum flex items-center justify-between text-sm">
          <span>{s.checklist.length ? <>서류 {s.checklist.length}개 중 <strong>{done}개</strong> 준비 완료</> : "서류 체크리스트 비어 있음"}</span>
          <span className="font-medium text-ink-muted">{open ? "접기" : "체크리스트"}</span>
        </span>
        {s.checklist.length > 0 && <Progress value={done} max={s.checklist.length} label="서류 준비 진행률" />}
      </button>

      {open && <Checklist savedPolicyId={s.id} items={s.checklist} onChange={(checklist) => onUpdate({ ...s, checklist })} />}

      <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
        {s.status === "saved" ? (
          <Button variant="primary" disabled={busy} onClick={() => setStatus("applied")} className="min-h-10 text-sm">신청 완료로 표시</Button>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={() => setStatus("saved")} className="min-h-10 text-sm">신청 완료 취소</Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={remove} className="min-h-10 text-sm text-ink-muted">저장 해제</Button>
      </div>
    </Card>
  );
}

function MyPolicies() {
  const [list, setList] = useState<Saved[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("active");

  useEffect(() => {
    api<{ saved: Saved[] }>("/api/me/saved").then((r) => setList(r.saved)).catch((e) => setErr((e as Error).message));
  }, []);

  const groups = useMemo(() => {
    const g: Record<Tab, Saved[]> = { active: [], applied: [], closed: [] };
    list?.forEach((s) => g[tabOf(s)].push(s));
    return g;
  }, [list]);

  const TABS: { v: Tab; label: string }[] = [
    { v: "active", label: "진행 중" },
    { v: "applied", label: "신청 완료" },
    { v: "closed", label: "마감됨" },
  ];

  return (
    <div className="mx-auto max-w-[880px] px-4 py-8 lg:px-6">
      <h1 className="display mb-6 text-[28px]">내 정책</h1>
      <div role="tablist" aria-label="내 정책 상태" className="mb-6 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.v}
            role="tab"
            aria-selected={tab === t.v}
            onClick={() => setTab(t.v)}
            className={cx("min-h-10 rounded-full border px-4 text-sm font-medium", tab === t.v ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:bg-paper")}
          >
            {t.label} <span className="tnum opacity-70">{groups[t.v].length}</span>
          </button>
        ))}
      </div>

      {err && <ErrorBox>{err}</ErrorBox>}
      {!list && !err && <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="skeleton h-44 rounded-xl" />)}</div>}
      {list && groups[tab].length === 0 && (
        <EmptyState
          title={tab === "active" ? "저장한 정책이 없어요" : tab === "applied" ? "신청 완료한 정책이 없어요" : "마감된 정책이 없어요"}
          body={tab === "active" ? "정책 카드의 ☆를 눌러 저장하면 마감 알림과 서류 체크리스트를 쓸 수 있어요." : undefined}
          action={tab === "active" ? <ButtonLink href="/policies">지원금 찾기</ButtonLink> : undefined}
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {list &&
          groups[tab].map((s) => (
            <SavedItem
              key={s.id}
              s={s}
              onUpdate={(n) => setList((l) => l!.map((x) => (x.id === n.id ? n : x)))}
              onRemove={() => setList((l) => l!.filter((x) => x.id !== s.id))}
            />
          ))}
      </div>
    </div>
  );
}

export default function MyPage() {
  return (
    <RequireLogin next="/my" title="내 정책">
      <MyPolicies />
    </RequireLogin>
  );
}
