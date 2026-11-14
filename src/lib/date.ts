// 모든 날짜 판단은 한국 시간(Asia/Seoul) 기준

const KST_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 한국 시간 기준 YYYY-MM-DD */
export function kstDate(d: Date = new Date()): string {
  return KST_FMT.format(d);
}

/** YYYY-MM-DD 두 날짜의 일수 차이 (b - a) */
export function diffDays(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((tb - ta) / 86_400_000);
}

/** 마감일까지 남은 일수. 마감일 없으면 null */
export function dDay(applyEnd: string | null, today: string = kstDate()): number | null {
  if (!applyEnd) return null;
  return diffDays(today, applyEnd);
}

export function addDays(ymd: string, n: number): string {
  const t = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "20250301", "2025.03.01", "2025-3-1" 등을 YYYY-MM-DD로. 실패하면 null */
export function normalizeDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).match(/(20\d{2})\s*[.\-/년]?\s*(\d{1,2})\s*[.\-/월]?\s*(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const mm = +mo, dd = +d;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * 출생연도만 받으므로 만 나이는 두 값 중 하나다.
 * [올해 생일 전 나이, 올해 생일 후 나이]
 */
export function ageRangeFromBirthYear(birthYear: number, today: string = kstDate()): [number, number] {
  const after = +today.slice(0, 4) - birthYear;
  return [after - 1, after];
}
