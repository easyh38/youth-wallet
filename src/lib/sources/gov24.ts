// 보조금24 공공서비스 목록 API (행정안전부, api.odcloud.kr)
// 청년과 무관한 서비스는 걸러낸다.

import type { Policy, UnknownField } from "../types";
import { clean, inferCategory, parseAgeRange, parseAmountMax, parsePeriod, pushUnknown, regionsFromAgency } from "./parse";

type Raw = Record<string, unknown>;

// 전체 약 1.1만 건을 끝까지 읽는다 (1,000건 ≈ 0.5초·1.9MB). 결과는 6시간 캐싱된다.
// MAX_PAGES는 API가 totalCount를 잘못 줄 때 무한 반복을 막는 안전장치
const PER_PAGE = 1000;
const MAX_PAGES = 30;
// 청년 서비스 판별 (실데이터 10,942건으로 검증, 2026-11)
// - 강한 키워드: 거의 항상 청년 대상 → 무조건 통과
//   ("청년 행정체험단"은 급여 있는 일자리, "청년문화예술패스"는 관람 지원이므로 강한 쪽엔 제외 규칙을 걸지 않는다)
// - 약한 키워드: "초·중·고·대학생 누구나"처럼 청년이 여러 대상 중 하나일 때가 많다.
//   학자금대출·국가장학금·버팀목전세처럼 진짜 정책도 많아 기본은 통과, 확실한 잡음만 뺀다.
//   나이 숫자는 제외 조건("75세 이상 제외")이나 부모 나이로도 쓰여 오판이 잦으므로 "40~59세"처럼 범위일 때만 본다.
const STRONG_RE = /청년|사회초년|자립준비/;
const WEAK_RE = /대학생|대학원생|신혼|구직|취업준비/;
const NOT_BENEFIT_TITLE_RE = /견학|관람|공연|전시|축제|행사|대장정|인식개선|홍보/;
const OTHER_GROUP_TITLE_RE = /중장년|노인|어르신|시니어|퇴직/;
const AGE_RANGE_RE = /만?(\d{2})세?(?:이상)?[~∼\-–부터]+만?\d{2}세/;

export function isYouthService(r: Raw): boolean {
  const title = clean(r["서비스명"]);
  const target = clean(r["지원대상"]);
  const text = `${title} ${target} ${clean(r["서비스목적요약"])}`;
  if (STRONG_RE.test(text)) return true;
  if (!WEAK_RE.test(text)) return false;
  if (NOT_BENEFIT_TITLE_RE.test(title) || OTHER_GROUP_TITLE_RE.test(title)) return false;
  const range = target.replace(/\s/g, "").match(AGE_RANGE_RE);
  if (range && +range[1] >= 40) return false;
  return true;
}

const CONCURRENCY = 4;

async function fetchPage(base: string, key: string, page: number): Promise<{ data: Raw[]; total: number }> {
  const url = `${base}?page=${page}&perPage=${PER_PAGE}&returnType=JSON&serviceKey=${encodeURIComponent(key)}`;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
      if (!res.ok) throw new Error(`gov24 HTTP ${res.status}`);
      const json = (await res.json()) as { data?: Raw[]; totalCount?: number };
      return { data: json.data ?? [], total: json.totalCount ?? 0 };
    } catch (err) {
      lastErr = err as Error;
      // 키 오류 같은 4xx는 다시 해도 같다
      if (/HTTP 4\d\d/.test(lastErr.message)) break;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error("gov24: 불러오기 실패");
}

export async function fetchGov24(): Promise<Policy[]> {
  const key = process.env.GOV24_API_KEY!;
  const base = process.env.GOV24_API_URL || "https://api.odcloud.kr/api/gov24/v3/serviceList";
  // 첫 페이지로 전체 건수를 알고, 나머지는 몇 페이지씩 동시에 받는다
  const first = await fetchPage(base, key, 1);
  const all: Raw[] = [...first.data];
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PER_PAGE));
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2);
  for (let i = 0; i < rest.length; i += CONCURRENCY) {
    const chunk = await Promise.all(rest.slice(i, i + CONCURRENCY).map((p) => fetchPage(base, key, p)));
    for (const c of chunk) all.push(...c.data);
  }
  return all
    .filter(isYouthService)
    .map(normalizeGov24);
}

export function normalizeGov24(r: Raw): Policy {
  const unknown: UnknownField[] = [];
  const title = clean(r["서비스명"]);
  const target = clean(r["지원대상"]);
  const criteria = clean(r["선정기준"]);
  const content = clean(r["지원내용"]);
  const method = clean(r["신청방법"]);
  const agency = clean(r["소관기관명"]);

  const age = parseAgeRange(`${target} ${criteria}`);
  pushUnknown(unknown, !age.found, "age");

  // 소관기관이 지자체면 그 지역(시·군·구까지), 중앙부처면 전국으로 본다
  const regionCodes = regionsFromAgency(agency, clean(r["소관기관유형"]));
  pushUnknown(unknown, regionCodes.length === 0, "region");

  const period = parsePeriod(clean(r["신청기한"]));
  pushUnknown(unknown, !period.always && !period.end, "period");
  pushUnknown(unknown, /소득|중위|재산/.test(`${target} ${criteria}`), "income");

  const summaryRaw = [
    target && `지원대상: ${target}`,
    criteria && `선정기준: ${criteria}`,
    content && `지원내용: ${content}`,
    clean(r["신청기한"]) && `신청기간: ${clean(r["신청기한"])}`,
    method && `신청방법: ${method}`,
  ].filter(Boolean).join("\n");

  return {
    id: `gov24-${clean(r["서비스ID"])}`,
    source: "gov24",
    title,
    agency: agency || "보조금24",
    category: inferCategory(clean(r["서비스분야"]), title),
    regionCodes,
    ageMin: age.min,
    ageMax: age.max,
    incomeMax: null,
    studentStatus: null,
    employmentStatus: null,
    applyStart: period.start,
    applyEnd: period.end,
    isAlwaysOpen: period.always,
    summaryRaw,
    detailUrl: clean(r["상세조회URL"]) || "https://www.gov.kr",
    attachmentUrls: [],
    unknownFields: unknown,
    amountMax: parseAmountMax(content),
  };
}
