import { dDay } from "./date";

/** 2400000 → "240만 원", 100000000 → "1억 원" */
export function formatWon(won: number): string {
  if (won >= 1e8) {
    const eok = Math.floor(won / 1e8);
    const man = Math.round((won % 1e8) / 1e4);
    return man ? `${eok}억 ${man.toLocaleString("ko-KR")}만 원` : `${eok}억 원`;
  }
  if (won >= 1e4) return `${Math.round(won / 1e4).toLocaleString("ko-KR")}만 원`;
  return `${won.toLocaleString("ko-KR")}원`;
}

export type DdayTone = "urgent" | "warn" | "neutral" | "closed";

export function ddayInfo(applyEnd: string | null, isAlwaysOpen: boolean, today?: string): { label: string; tone: DdayTone; days: number | null } {
  if (isAlwaysOpen) return { label: "상시 모집", tone: "neutral", days: null };
  const d = dDay(applyEnd, today);
  if (d == null) return { label: "마감일 확인 필요", tone: "neutral", days: null };
  if (d < 0) return { label: "마감됨", tone: "closed", days: d };
  const label = d === 0 ? "D-DAY" : `D-${d}`;
  return { label, tone: d <= 3 ? "urgent" : d <= 7 ? "warn" : "neutral", days: d };
}

export function formatDate(ymd: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${y}.${m}.${d}`;
}
