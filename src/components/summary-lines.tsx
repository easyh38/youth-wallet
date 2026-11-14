import { CalendarDays, Users, Wallet } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cx } from "./ui";

type Lines = { target: string | null; amount: string | null; deadline: string | null; isAlwaysOpen: boolean };

const MISSING = <span className="text-ink-muted">공고문 확인 필요</span>;

/** 3줄 요약: 지원 대상 / 지원 금액 / 마감일. 마감일은 API 원본(applyEnd)을 우선한다 */
export function SummaryLines({ s, applyEnd, isAlwaysOpen, compact }: { s: Lines; applyEnd: string | null; isAlwaysOpen: boolean; compact?: boolean }) {
  const deadline = isAlwaysOpen || s.isAlwaysOpen ? "상시 모집" : applyEnd ? formatDate(applyEnd) : s.deadline ? formatDate(s.deadline) : null;
  const rows = [
    { icon: Users, label: "지원 대상", value: s.target, strong: false },
    { icon: Wallet, label: "지원 금액", value: s.amount, strong: true },
    { icon: CalendarDays, label: "마감일", value: deadline, strong: false },
  ];
  return (
    <dl className={cx("flex flex-col", compact ? "gap-1.5 text-[15px]" : "gap-3 text-base")}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-2.5">
          <dt className="flex shrink-0 items-center gap-1.5 pt-0.5 text-ink-muted">
            <r.icon size={compact ? 16 : 18} aria-hidden />
            <span className={compact ? "sr-only" : "w-16 text-sm"}>{r.label}</span>
          </dt>
          <dd className={cx("min-w-0", r.strong && "font-semibold", compact && "line-clamp-2")}>
            {r.value ?? MISSING}
          </dd>
        </div>
      ))}
    </dl>
  );
}
