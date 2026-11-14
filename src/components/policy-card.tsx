"use client";

import { ListChecks, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client";
import { ddayInfo } from "@/lib/format";
import type { MatchStatus, Policy } from "@/lib/types";
import { SaveButton } from "./save-button";
import { SummaryLines } from "./summary-lines";
import { cx, DdayBadge, SourceBadge, StatusBadge } from "./ui";

export type CardSummary = { target: string | null; amount: string | null; deadline: string | null; isAlwaysOpen: boolean };

/** 정책 카드: 배지 → 정책명 → 기관 → 3줄 요약 */
export function PolicyCard({
  policy: p, status, reasons, summary, saved, selected, onOpen, onSavedChange, onSummary,
}: {
  policy: Policy;
  status: MatchStatus;
  reasons: string[];
  summary?: CardSummary;
  saved: boolean;
  selected?: boolean;
  onOpen: () => void;
  onSavedChange: (saved: boolean) => void;
  onSummary: (s: CardSummary) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const dd = ddayInfo(p.applyEnd, p.isAlwaysOpen);

  async function summarize(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading(true);
    setErr("");
    try {
      const { summary } = await api<{ summary: CardSummary }>(`/api/policies/${encodeURIComponent(p.id)}/summary`, { method: "POST" });
      onSummary(summary);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article
      onClick={onOpen}
      className={cx(
        "group flex cursor-pointer flex-col gap-3 rounded-xl border bg-surface p-5 transition-shadow duration-150 hover:shadow-[0_2px_12px_rgba(26,25,25,0.07)]",
        selected ? "border-ink ring-1 ring-ink" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={status} />
          <DdayBadge {...dd} />
          <SourceBadge source={p.source} />
        </div>
        <SaveButton policyId={p.id} saved={saved} onChange={onSavedChange} />
      </div>

      <div>
        <h3 className="text-[17px] leading-snug font-semibold tracking-[-0.01em]">
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className="text-left hover:underline hover:underline-offset-4">
            {p.title}
          </button>
        </h3>
        <p className="mt-1 text-[13px] text-ink-muted">{p.agency}</p>
      </div>

      <div className="mt-auto border-t border-line-soft pt-3">
        {summary ? (
          <SummaryLines s={summary} applyEnd={p.applyEnd} isAlwaysOpen={p.isAlwaysOpen} compact />
        ) : (
          <button
            type="button"
            onClick={summarize}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold hover:bg-paper disabled:opacity-50"
          >
            {loading ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <ListChecks size={16} aria-hidden />}
            {loading ? "요약하는 중…" : "3줄 요약 보기"}
          </button>
        )}
        {err && <p role="alert" className="mt-2 text-[13px] text-urgent">{err}</p>}
        {status === "check" && reasons.length > 0 && (
          <p className="mt-2 text-[13px] text-warn">{reasons[0]}{reasons.length > 1 && ` 외 ${reasons.length - 1}건`}</p>
        )}
      </div>
    </article>
  );
}
