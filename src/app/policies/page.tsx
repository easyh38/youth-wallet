"use client";

import { Info, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PolicyCard, type CardSummary } from "@/components/policy-card";
import { PolicyDetail } from "@/components/policy-detail";
import { ButtonLink, cx, EmptyState, ErrorBox, PolicyCardSkeleton } from "@/components/ui";
import { api, resolveProfile } from "@/lib/client";
import { formatWon } from "@/lib/format";
import type { MatchedPolicy } from "@/lib/match";
import { regionName } from "@/lib/regions";
import {
  CATEGORY_LABEL, INTEREST_TO_CATEGORY, SOURCE_LABEL,
  type Category, type MatchStatus, type Source, type UserProfile,
} from "@/lib/types";

type SourceStatus = { source: Source; ok: boolean; isSample: boolean; fetchedAt: string | null; count: number };
type MatchResponse = {
  results: MatchedPolicy[];
  counts: { eligible: number; check: number; excluded: number };
  eligibleAmount: number;
  sources: SourceStatus[];
  summaries: Record<string, CardSummary>;
};

type Tab = "all" | "interest" | Category;
type StatusFilter = "all" | MatchStatus;

const CATEGORIES: Category[] = ["housing", "scholarship", "job", "startup", "welfare", "etc"];

function useIsDesktop() {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesk(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desk;
}

function Filters({
  status, setStatus, sources, setSources, counts,
}: {
  status: StatusFilter; setStatus: (s: StatusFilter) => void;
  sources: Source[]; setSources: (s: Source[]) => void;
  counts: MatchResponse["counts"];
}) {
  const opts: { v: StatusFilter; label: string; n?: number }[] = [
    { v: "all", label: "전체", n: counts.eligible + counts.check },
    { v: "eligible", label: "신청 가능", n: counts.eligible },
    { v: "check", label: "조건 확인 필요", n: counts.check },
  ];
  return (
    <div className="flex flex-col gap-8">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-ink-muted">매칭 결과</legend>
        <div className="flex flex-col gap-1">
          {opts.map((o) => (
            <label key={o.v} className={cx("flex min-h-11 cursor-pointer items-center justify-between rounded-lg px-3 text-[15px]", status === o.v ? "bg-ink text-paper" : "hover:bg-line-soft")}>
              <span className="flex items-center gap-2">
                <input type="radio" name="status" className="sr-only" checked={status === o.v} onChange={() => setStatus(o.v)} />
                {o.label}
              </span>
              <span className="tnum text-sm opacity-70">{o.n}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-ink-muted">출처</legend>
        <div className="flex flex-col gap-1">
          {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => {
            const on = sources.includes(s);
            return (
              <label key={s} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-[15px] hover:bg-line-soft">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setSources(on ? sources.filter((x) => x !== s) : [...sources, s])}
                  className="h-4 w-4 accent-[var(--ink)]"
                />
                {SOURCE_LABEL[s]}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export default function PoliciesPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const isDesktop = useIsDesktop();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [data, setData] = useState<MatchResponse | null>(null);
  const [err, setErr] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>("all");
  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [sourceF, setSourceF] = useState<Source[]>(["youth", "gov24", "kosaf"]);
  const [sheet, setSheet] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const run = useCallback(async (p: UserProfile) => {
    setErr("");
    setData(null);
    try {
      setData(await api<MatchResponse>("/api/policies/match", { method: "POST", json: { profile: p } }));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (authStatus === "loading") return;
    resolveProfile(authStatus === "authenticated").then((p) => {
      if (!p) return router.replace("/profile");
      setProfile(p);
      if (p.interests.length) setTab("interest");
      run(p);
    });
    if (authStatus === "authenticated") {
      api<{ saved: { policyId: string }[] }>("/api/me/saved")
        .then(({ saved }) => setSavedIds(new Set(saved.map((s) => s.policyId))))
        .catch(() => {});
    }
  }, [authStatus, router, run]);

  const interestCats = useMemo(() => new Set((profile?.interests ?? []).map((i) => INTEREST_TO_CATEGORY[i])), [profile]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.results.filter((r) => {
      if (statusF !== "all" && r.status !== statusF) return false;
      if (!sourceF.includes(r.policy.source)) return false;
      if (tab === "interest") return interestCats.has(r.policy.category);
      if (tab !== "all") return r.policy.category === tab;
      return true;
    });
  }, [data, statusF, sourceF, tab, interestCats]);

  const tabs: { v: Tab; label: string }[] = [
    ...(interestCats.size ? [{ v: "interest" as Tab, label: "관심 분야" }] : []),
    { v: "all", label: "전체" },
    ...CATEGORIES.filter((c) => data?.results.some((r) => r.policy.category === c)).map((c) => ({ v: c as Tab, label: CATEGORY_LABEL[c] })),
  ];

  function open(id: string) {
    if (isDesktop) setSelected(id);
    else router.push(`/policies/${encodeURIComponent(id)}`);
  }

  function setSaved(id: string, saved: boolean) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (saved) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function setSummary(id: string, s: CardSummary) {
    setData((d) => (d ? { ...d, summaries: { ...d.summaries, [id]: s } } : d));
  }

  const sample = data?.sources.filter((s) => s.isSample) ?? [];
  const failed = data?.sources.filter((s) => !s.ok) ?? [];
  const kosaf = data?.sources.find((s) => s.source === "kosaf");
  const panelOpen = isDesktop && !!selected;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 lg:px-6">
      {/* 요약 숫자 */}
      <section className="mb-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">
            {profile && `${regionName(profile.regionCode)} · ${profile.birthYear}년생 · ${profile.studentStatus} · ${profile.employmentStatus}`}
          </p>
          <ButtonLink href="/profile" variant="ghost" className="-mr-3 min-h-9 text-sm">조건 바꾸기</ButtonLink>
        </div>
        {data ? (
          <h1 className="display flex flex-wrap gap-x-3 text-[30px] sm:text-[40px]">
            <span className="whitespace-nowrap">
              신청 가능 <span className="tnum bg-[linear-gradient(transparent_62%,var(--highlight)_62%)] px-0.5">{data.counts.eligible}</span>개
            </span>
            <span className="whitespace-nowrap">
              <span className="text-ink-muted max-sm:hidden" aria-hidden>· </span>확인 필요 <span className="tnum">{data.counts.check}</span>개
            </span>
            {data.eligibleAmount > 0 && (
              <span className="whitespace-nowrap">
                <span className="text-ink-muted max-sm:hidden" aria-hidden>· </span>
                최대 <span className="tnum bg-[linear-gradient(transparent_62%,var(--highlight)_62%)] px-0.5">{formatWon(data.eligibleAmount)}</span>
              </span>
            )}
          </h1>
        ) : (
          <div className="skeleton h-12 w-3/4 max-w-xl" aria-hidden />
        )}
        {data && data.eligibleAmount > 0 && (
          <p className="text-[13px] text-ink-muted">금액은 공고에 숫자로 적힌 신청 가능 정책만 더한 값이에요.</p>
        )}
      </section>

      {/* 데이터 상태 안내 */}
      {sample.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-info-bg px-4 py-3 text-sm text-info">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          {sample.map((s) => SOURCE_LABEL[s.source]).join("·")} API 키가 설정되지 않아 연습용 샘플 데이터를 보여주고 있어요. 실제 공고와 다를 수 있어요.
        </p>
      )}
      {failed.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          {failed.map((s) => SOURCE_LABEL[s.source]).join("·")} 정보를 불러오지 못했어요. 나머지 결과만 보여 드려요.
        </p>
      )}
      {err && <div className="mb-4"><ErrorBox>{err}</ErrorBox></div>}

      {/* 분야 탭 */}
      <div className="sticky top-14 z-20 -mx-4 mb-6 flex items-center gap-2 bg-paper/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
        <div role="tablist" aria-label="분야" className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t.v}
              role="tab"
              aria-selected={tab === t.v}
              onClick={() => setTab(t.v)}
              className={cx(
                "min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors duration-150",
                tab === t.v ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:bg-paper",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-medium lg:hidden"
          aria-haspopup="dialog"
        >
          <SlidersHorizontal size={16} aria-hidden /> 필터
          {(statusF !== "all" || sourceF.length < 3) && <span className="h-1.5 w-1.5 rounded-full bg-ink" aria-label="필터 적용됨" />}
        </button>
      </div>

      <div className="flex gap-8">
        {/* 데스크톱 왼쪽 필터 */}
        <aside className="hidden w-[200px] shrink-0 lg:block" aria-label="필터">
          <div className="sticky top-32">
            {data && <Filters status={statusF} setStatus={setStatusF} sources={sourceF} setSources={setSourceF} counts={data.counts} />}
            {kosaf?.fetchedAt && (
              <p className="mt-8 text-[13px] text-ink-muted">
                장학재단 데이터 기준일 {new Date(kosaf.fetchedAt).toLocaleDateString("ko-KR")}
                <br />실시간이 아니며 일부 기관만 포함돼요.
              </p>
            )}
          </div>
        </aside>

        {/* 카드 목록 */}
        <section className="min-w-0 flex-1" aria-label="정책 목록" aria-busy={!data}>
          <div className={cx("grid gap-4", panelOpen ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3")}>
            {!data && !err && Array.from({ length: 6 }, (_, i) => <PolicyCardSkeleton key={i} />)}
            {visible.map((r) => (
              <PolicyCard
                key={r.policy.id}
                policy={r.policy}
                status={r.status}
                reasons={r.reasons}
                summary={data?.summaries[r.policy.id]}
                saved={savedIds.has(r.policy.id)}
                selected={selected === r.policy.id && panelOpen}
                onOpen={() => open(r.policy.id)}
                onSavedChange={(s) => setSaved(r.policy.id, s)}
                onSummary={(s) => setSummary(r.policy.id, s)}
              />
            ))}
          </div>
          {data && visible.length === 0 && (
            <EmptyState
              title="조건에 맞는 정책이 없어요"
              body={tab !== "all" || statusF !== "all" ? "다른 분야나 필터를 골라 보세요." : "조건을 바꿔 다시 찾아보세요."}
              action={<ButtonLink href="/profile" variant="secondary">조건 바꾸기</ButtonLink>}
            />
          )}
          {kosaf?.fetchedAt && (
            <p className="mt-8 text-[13px] text-ink-muted lg:hidden">
              장학재단 데이터 기준일 {new Date(kosaf.fetchedAt).toLocaleDateString("ko-KR")} · 실시간이 아니며 일부 기관만 포함돼요.
            </p>
          )}
        </section>

        {/* 데스크톱 오른쪽 상세 패널 */}
        {panelOpen && (
          <aside className="anim-fade sticky top-32 hidden max-h-[calc(100dvh-9rem)] w-[420px] shrink-0 overflow-y-auto rounded-xl border border-line bg-paper lg:block" aria-label="정책 상세">
            <PolicyDetail
              key={selected}
              id={selected!}
              onClose={() => setSelected(null)}
              onSavedChange={(s) => setSaved(selected!, s)}
              onSummary={(s) => setSummary(selected!, s)}
            />
          </aside>
        )}
      </div>

      {/* 모바일 하단 시트 필터 */}
      {sheet && data && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="필터">
          <button type="button" aria-label="필터 닫기" className="anim-fade absolute inset-0 bg-black/40" onClick={() => setSheet(false)} />
          <div className="anim-sheet absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold">필터</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label="닫기" className="-m-2 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-line-soft">
                <X size={20} aria-hidden />
              </button>
            </div>
            <Filters status={statusF} setStatus={setStatusF} sources={sourceF} setSources={setSourceF} counts={data.counts} />
            <button type="button" onClick={() => setSheet(false)} className="mt-6 min-h-12 w-full rounded-full bg-ink font-semibold text-paper">
              {visible.length}개 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
