"use client";

import { ExternalLink, FileText, Info, ListChecks, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ddayInfo, formatDate } from "@/lib/format";
import { regionName } from "@/lib/regions";
import { CATEGORY_LABEL, type Policy, type Summary } from "@/lib/types";
import { Checklist, type ChecklistItemT } from "./checklist";
import { SaveButton } from "./save-button";
import { SummaryLines } from "./summary-lines";
import { AiNotice, Badge, Button, ButtonLink, DdayBadge, ErrorBox, SourceBadge } from "./ui";

type SummaryT = Summary & { engine: "factchat" | "rule"; cached: boolean };
type Detail = {
  policy: Policy;
  summary: SummaryT | null;
  saved: { id: string; status: string; checklist: ChecklistItemT[] } | null;
};

export function PolicyDetail({
  id, onClose, onSavedChange, onSummary,
}: {
  id: string;
  onClose?: () => void;
  onSavedChange?: (saved: boolean) => void;
  onSummary?: (s: SummaryT) => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [sumErr, setSumErr] = useState("");

  // 부모가 id별로 key를 주므로 id가 바뀌면 컴포넌트가 새로 만들어진다
  const load = useCallback(
    () =>
      api<Detail>(`/api/policies/${encodeURIComponent(id)}`)
        .then((d) => {
          setData(d);
          setLoadErr("");
        })
        .catch((e: Error) => setLoadErr(e.message)),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function summarize() {
    setSummarizing(true);
    setSumErr("");
    try {
      const { summary } = await api<{ summary: SummaryT }>(`/api/policies/${encodeURIComponent(id)}/summary`, { method: "POST" });
      setData((d) => (d ? { ...d, summary } : d));
      onSummary?.(summary);
    } catch (e) {
      setSumErr((e as Error).message);
    } finally {
      setSummarizing(false);
    }
  }

  if (loadErr) return <div className="p-6"><ErrorBox>{loadErr}</ErrorBox></div>;
  if (!data) {
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy>
        <div className="skeleton h-6 w-1/3 rounded-full" />
        <div className="skeleton h-8 w-4/5" />
        <div className="skeleton h-4 w-1/2" />
        <div className="skeleton mt-4 h-32 w-full rounded-xl" />
      </div>
    );
  }

  const { policy: p, summary, saved } = data;
  const dd = ddayInfo(p.applyEnd, p.isAlwaysOpen);
  const deadlineMismatch = !!summary?.deadline && !!p.applyEnd && summary.deadline !== p.applyEnd;
  const regions = p.regionCodes.includes("ALL") ? "전국" : p.regionCodes.length ? p.regionCodes.map(regionName).join(", ") : "공고문 확인 필요";

  return (
    <article className="flex flex-col gap-8 p-5 sm:p-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            <SourceBadge source={p.source} />
            <Badge>{CATEGORY_LABEL[p.category]}</Badge>
            <DdayBadge {...dd} />
            {saved?.status === "applied" && <Badge tone="ok">신청 완료</Badge>}
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="상세 닫기" className="-m-2 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-line-soft">
              <X size={20} aria-hidden />
            </button>
          )}
        </div>
        <h1 className="display text-[24px] sm:text-[28px]">{p.title}</h1>
        <p className="text-sm text-ink-muted">{p.agency} · {regions}</p>
        {!p.isAlwaysOpen && (p.applyStart || p.applyEnd) && (
          <p className="tnum text-sm">
            신청 기간 {formatDate(p.applyStart) || "공고문 확인"} ~ {formatDate(p.applyEnd) || "공고문 확인"}
          </p>
        )}
        <div className="flex items-center gap-3">
          <ButtonLink href={p.detailUrl} target="_blank" rel="noopener noreferrer" variant="accent" className="flex-1 sm:flex-none">
            원문 보고 신청하기 <ExternalLink size={16} aria-hidden />
          </ButtonLink>
          <SaveButton
            policyId={p.id}
            saved={!!saved}
            size="lg"
            onChange={(isSaved) => {
              onSavedChange?.(isSaved);
              load(); // 체크리스트를 다시 불러온다
            }}
          />
        </div>
      </header>

      {/* 3줄 요약 */}
      <section aria-labelledby="sum-h" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 id="sum-h" className="flex items-center gap-2 text-[17px] font-semibold">
            <ListChecks size={18} aria-hidden /> 3줄 요약
          </h2>
          {summary?.engine === "rule" && <Badge tone="info">데모 요약</Badge>}
        </div>

        {summary ? (
          <>
            <SummaryLines s={summary} applyEnd={p.applyEnd} isAlwaysOpen={p.isAlwaysOpen} />
            {deadlineMismatch && (
              <p className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
                공고문과 날짜가 다를 수 있어요. (AI가 읽은 마감일: {formatDate(summary.deadline)})
              </p>
            )}
            {summary.applyMethod && (
              <div className="border-t border-line-soft pt-4">
                <h3 className="mb-1 text-sm font-semibold text-ink-muted">신청 방법</h3>
                <p className="text-[15px]">{summary.applyMethod}</p>
              </div>
            )}
            {summary.documents.length > 0 && !saved && (
              <div className="border-t border-line-soft pt-4">
                <h3 className="mb-2 text-sm font-semibold text-ink-muted">필요 서류</h3>
                <ul className="flex flex-col gap-1.5">
                  {summary.documents.map((doc) => (
                    <li key={doc} className="flex items-center gap-2 text-[15px]"><FileText size={15} className="text-ink-muted" aria-hidden />{doc}</li>
                  ))}
                </ul>
                <p className="mt-3 text-[13px] text-ink-muted">☆ 저장하면 서류 체크리스트로 준비 상황을 관리할 수 있어요.</p>
              </div>
            )}
            {summary.engine === "rule" && (
              <p className="flex items-start gap-2 text-[13px] text-ink-muted">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
                팩트챗 API가 설정되지 않아 원문에서 항목을 그대로 옮긴 데모 요약이에요.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[15px] text-ink-muted">긴 공고문을 지원 대상·지원 금액·마감일로 정리해 드려요.</p>
            <Button onClick={summarize} disabled={summarizing}>
              {summarizing ? <><LoaderCircle size={17} className="animate-spin" aria-hidden /> 요약하는 중…</> : "3줄 요약 보기"}
            </Button>
            {sumErr && <ErrorBox>{sumErr}</ErrorBox>}
          </div>
        )}
        <AiNotice />
      </section>

      {saved && (
        <Checklist
          savedPolicyId={saved.id}
          items={saved.checklist}
          onChange={(items) => setData((d) => (d && d.saved ? { ...d, saved: { ...d.saved, checklist: items } } : d))}
        />
      )}

      {/* 원본 설명 */}
      <section aria-labelledby="raw-h" className="flex flex-col gap-2">
        <h2 id="raw-h" className="text-[17px] font-semibold">원본 설명</h2>
        <p className="text-sm whitespace-pre-line text-ink-muted">{p.summaryRaw || "원문 사이트에서 확인해 주세요."}</p>
        <a href={p.detailUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 self-start text-sm font-medium text-info underline underline-offset-4">
          원문 링크 열기 <ExternalLink size={14} aria-hidden />
        </a>
      </section>
    </article>
  );
}
