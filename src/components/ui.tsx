import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { DdayTone } from "@/lib/format";
import { SOURCE_LABEL, type MatchStatus, type Source } from "@/lib/types";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ─── 버튼: 알약형, 최소 높이 44px ───
type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:opacity-90",
  accent: "bg-accent text-on-accent hover:brightness-95",
  secondary: "border border-line bg-surface text-ink hover:bg-paper",
  ghost: "text-ink hover:bg-line-soft",
  danger: "border border-urgent/40 bg-surface text-urgent hover:bg-urgent-bg",
};
const BTN = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-[opacity,background-color,filter] duration-150 disabled:cursor-not-allowed disabled:opacity-40";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(BTN, VARIANT[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(BTN, VARIANT[variant], className)} {...props} />;
}

// ─── 배지: 알약형, 높이 24px, 항상 글자를 함께 ───
const TONE = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  urgent: "bg-urgent-bg text-urgent",
  neutral: "bg-paper text-ink-muted",
  info: "bg-info-bg text-info",
} as const;

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof TONE; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium tracking-[0.02em] whitespace-nowrap", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: MatchStatus }) {
  return status === "eligible" ? <Badge tone="ok">✓ 신청 가능</Badge> : <Badge tone="warn">! 조건 확인 필요</Badge>;
}

export function SourceBadge({ source }: { source: Source }) {
  return <Badge>{SOURCE_LABEL[source]}</Badge>;
}

export function DdayBadge({ label, tone }: { label: string; tone: DdayTone }) {
  const t = tone === "urgent" ? "urgent" : tone === "warn" ? "warn" : "neutral";
  return <Badge tone={t} className="tnum font-semibold">{label}</Badge>;
}

export function AiNotice({ className }: { className?: string }) {
  return (
    <p className={cx("text-[13px] text-ink-muted", className)}>
      AI 요약이라 틀릴 수 있어요. 신청 전 원문을 꼭 확인하세요.
    </p>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-line bg-surface", className)} {...props} />;
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-soft" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-full rounded-full bg-ok-bar transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PolicyCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-5" aria-hidden>
      <div className="flex gap-2"><div className="skeleton h-6 w-16 rounded-full" /><div className="skeleton h-6 w-12 rounded-full" /></div>
      <div className="skeleton h-5 w-3/4" />
      <div className="skeleton h-4 w-1/3" />
      <div className="mt-2 flex flex-col gap-2"><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-5/6" /><div className="skeleton h-4 w-2/3" /></div>
    </Card>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-ink-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-lg bg-urgent-bg px-4 py-3 text-sm text-urgent">{children}</p>;
}
