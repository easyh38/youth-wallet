// 온통청년 청년정책 API (한국고용정보원, getPlcy)
// 필드명·코드값은 실제 응답(2026-11, 약 4,000건)을 보고 맞췄다.
// - 학력·취업 상태·소득·신청기간 구분은 이름이 아니라 코드값(0049005 등)으로 온다
// - 지역(zipCd)은 시·군·구 코드 목록. 전남광주는 12xxx, 경기 등은 일반구 코드로 온다

import { normalizeDate } from "../date";
import { collapseRegionCodes, normalizeSigunguCode } from "../regions";
import type { EmploymentStatus, Policy, PolicyDetailItem, StudentStatus, UnknownField } from "../types";
import { clean, inferCategory, parseAgeRange, parseAmountMax, parsePeriod, pushUnknown } from "./parse";

type Raw = Record<string, unknown>;

const PAGE_SIZE = 500;
const MAX_PAGES = 30; // 1.5만 건까지
const CONCURRENCY = 4; // 한꺼번에 많이 부르면 HTML 오류 페이지가 온다

async function fetchPage(base: string, key: string, page: number): Promise<{ list: Raw[]; total: number }> {
  const url = `${base}?apiKeyNm=${encodeURIComponent(key)}&pageNum=${page}&pageSize=${PAGE_SIZE}&rtnType=json`;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
      if (!res.ok) throw new Error(`youth HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) throw new Error("youth: JSON이 아닌 응답 (요청 제한 또는 키 오류)");
      const json = JSON.parse(text) as {
        resultCode?: number;
        resultMessage?: string;
        result?: { youthPolicyList?: Raw[]; pagging?: { totCount?: number } };
      };
      if (json.resultCode && json.resultCode !== 200) throw new Error(`youth: ${json.resultMessage ?? json.resultCode}`);
      return { list: json.result?.youthPolicyList ?? [], total: json.result?.pagging?.totCount ?? 0 };
    } catch (err) {
      lastErr = err as Error;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error("youth: 불러오기 실패");
}

export async function fetchYouth(): Promise<Policy[]> {
  const key = process.env.YOUTH_API_KEY!;
  const base = process.env.YOUTH_API_URL || "https://www.youthcenter.go.kr/go/ythip/getPlcy";

  const first = await fetchPage(base, key, 1);
  const all: Raw[] = [...first.list];
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE_SIZE));
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2);
  for (let i = 0; i < rest.length; i += CONCURRENCY) {
    const chunk = await Promise.all(rest.slice(i, i + CONCURRENCY).map((p) => fetchPage(base, key, p)));
    for (const c of chunk) all.push(...c.list);
  }

  // 같은 정책이 페이지 경계에서 두 번 올 수 있다
  const seen = new Set<string>();
  return all
    .filter((r) => {
      const id = clean(r.plcyNo);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .filter((r) => !isClosed(r))
    .map(normalizeYouth);
}

// ─── 코드값 ───

/** 신청기간 구분: 0057001 특정기간, 0057002 상시, 0057003 마감 */
const isClosed = (r: Raw) => clean(r.aplyPrdSeCd) === "0057003";
const isAlways = (r: Raw) => clean(r.aplyPrdSeCd) === "0057002";

const SCHOOL: Record<string, { name: string; as?: StudentStatus }> = {
  "0049001": { name: "고졸 미만" },
  "0049002": { name: "고교 재학" },
  "0049003": { name: "고졸 예정" },
  "0049004": { name: "고교 졸업", as: "졸업" },
  "0049005": { name: "대학 재학", as: "재학" },
  "0049006": { name: "대졸 예정", as: "졸업예정" },
  "0049007": { name: "대학 졸업", as: "졸업" },
  "0049008": { name: "석·박사" },
  "0049009": { name: "기타" },
};
const SCHOOL_ANY = "0049010";

const JOB: Record<string, { name: string; as?: EmploymentStatus }> = {
  "0013001": { name: "재직자", as: "재직" },
  "0013002": { name: "자영업자", as: "자영업" },
  "0013003": { name: "미취업자", as: "미취업" },
  "0013004": { name: "프리랜서" },
  "0013005": { name: "일용근로자", as: "재직" },
  "0013006": { name: "(예비)창업자", as: "창업 준비" },
  "0013007": { name: "단기근로자", as: "재직" },
  "0013008": { name: "영농종사자" },
  "0013009": { name: "기타" },
};
const JOB_ANY = "0013010";

const MAJOR: Record<string, string> = {
  "0011001": "인문계열", "0011002": "사회계열", "0011003": "상경계열", "0011004": "이학계열",
  "0011005": "공학계열", "0011006": "예체능계열", "0011007": "농산업계열", "0011008": "기타",
};
const SPECIAL: Record<string, string> = {
  "0014001": "중소기업", "0014002": "여성", "0014003": "기초생활수급자", "0014004": "한부모가정",
  "0014005": "장애인", "0014006": "농업인", "0014007": "군인", "0014008": "지역인재", "0014009": "기타",
};
const MARRIAGE: Record<string, string> = { "0055001": "기혼", "0055002": "미혼" };

const codes = (raw: unknown) => clean(raw).split(/[,\s]+/).filter(Boolean);
const oneLine = (s: string) => s.replace(/\s*\n+\s*/g, " / ");
const isBlank = (s: string) => !s || /^[-\s.]*$/.test(s);
const text = (raw: unknown) => {
  const s = clean(raw);
  return isBlank(s) ? "" : s;
};

/** 학력·취업 코드 → 매칭용 값. 매칭할 수 없는 코드만 있으면 unknown */
function mapCodes<T extends string>(
  list: string[], table: Record<string, { name: string; as?: T }>, any: string,
): { values: T[] | null; names: string[]; unknown: boolean } {
  const known = list.filter((c) => table[c]);
  if (!known.length || list.includes(any)) return { values: null, names: [], unknown: false };
  const values = [...new Set(known.flatMap((c) => (table[c].as ? [table[c].as!] : [])))];
  return { values: values.length ? values : null, names: known.map((c) => table[c].name), unknown: values.length === 0 };
}

function category(r: Raw, title: string) {
  for (const t of [clean(r.mclsfNm), clean(r.lclsfNm), title]) {
    const c = inferCategory(t);
    if (c !== "etc") return c;
  }
  return "etc" as const;
}

function httpUrl(raw: unknown): string {
  const s = clean(raw);
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : /^www\./i.test(s) ? `https://${s}` : "";
}

function ymd(raw: unknown): string | null {
  return normalizeDate(clean(raw).replace(/\s/g, ""));
}

export function youthDetailUrl(plcyNo: string) {
  return `https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/${encodeURIComponent(plcyNo)}`;
}

// ─── 정규화 ───

export function normalizeYouth(r: Raw): Policy {
  const unknown: UnknownField[] = [];
  const plcyNo = clean(r.plcyNo);
  const title = clean(r.plcyNm);

  const explain = text(r.plcyExplnCn);
  const support = text(r.plcySprtCn);
  const extraQual = text(r.addAplyQlfcCndCn);
  const excluded = text(r.ptcpPrpTrgtCn);
  const method = text(r.plcyAplyMthdCn);
  const screening = text(r.srngMthdCn);
  const docs = text(r.sbmsnDcmntCn);
  const etc = text(r.etcMttrCn);

  // 나이: 숫자 필드 우선 (0은 '값 없음', 99는 '상한 없음'). 둘 다 없으면 문장에서 찾는다
  const minN = Number(r.sprtTrgtMinAge) || 0, maxN = Number(r.sprtTrgtMaxAge) || 0;
  let ageMin: number | null = minN > 1 ? minN : null;
  let ageMax: number | null = maxN > 0 && maxN < 99 ? maxN : null;
  if (!minN && !maxN) {
    const a = parseAgeRange([extraQual, explain, support].join("\n"));
    if (a.min != null || a.max != null) { ageMin = a.min; ageMax = a.max; }
    // 연령 제한 여부가 N인데 숫자가 없으면 공고문 확인
    else pushUnknown(unknown, clean(r.sprtTrgtAgeLmtYn) === "N", "age");
  }
  const ageText = ageMin != null || ageMax != null
    ? `만 ${ageMin ?? ""}${ageMin != null && ageMax != null ? "~" : ""}${ageMax ?? ""}세${ageMax == null ? " 이상" : ageMin == null ? " 이하" : ""}`
    : "";

  // 지역
  const zips = codes(r.zipCd).filter((z) => /^\d{5}$/.test(z)).map(normalizeSigunguCode);
  const regionCodes = zips.length ? collapseRegionCodes([...new Set(zips)]) : [];
  pushUnknown(unknown, regionCodes.length === 0, "region");

  // 신청 기간
  const periodText = clean(r.aplyYmd);
  const always = isAlways(r) || /상시/.test(periodText);
  const period = always ? { start: null, end: null, always: true } : parsePeriod(periodText);
  // "20260309 ~ 20250316"처럼 끝이 시작보다 앞서면 잘못 적힌 값이라 마감일을 모르는 것으로 둔다
  if (period.start && period.end && period.end < period.start) period.end = null;
  pushUnknown(unknown, !period.always && !period.end, "period");

  // 소득: 0043001 무관, 0043002 연소득(만 원), 0043003 기타(문장). 분위로 바꿀 수 없어 확인 필요로 둔다
  const earnCd = clean(r.earnCndSeCd);
  const earnMin = Number(r.earnMinAmt) || 0, earnMax = Number(r.earnMaxAmt) || 0;
  let incomeText = "";
  if (earnCd === "0043002" && (earnMin || earnMax)) {
    incomeText = `연소득 ${earnMin ? `${earnMin.toLocaleString("ko-KR")}만 원 이상 ` : ""}${earnMax ? `${earnMax.toLocaleString("ko-KR")}만 원 이하` : ""}`.trim();
  } else if (earnCd !== "0043001") {
    incomeText = text(r.earnEtcCn);
  }
  pushUnknown(unknown, !!incomeText && !/무관|제한\s*없/.test(incomeText), "income");

  const school = mapCodes(codes(r.schoolCd), SCHOOL, SCHOOL_ANY);
  pushUnknown(unknown, school.unknown, "student");
  const job = mapCodes(codes(r.jobCd), JOB, JOB_ANY);
  pushUnknown(unknown, job.unknown, "employment");

  const majors = codes(r.plcyMajorCd).map((c) => MAJOR[c]).filter(Boolean);
  const specials = codes(r.sbizCd).map((c) => SPECIAL[c]).filter(Boolean);
  const marriage = MARRIAGE[clean(r.mrgSttsCd)] ?? "";

  const bizStart = ymd(r.bizPrdBgngYmd), bizEnd = ymd(r.bizPrdEndYmd);
  const bizText = bizStart || bizEnd
    ? `${bizStart?.replace(/-/g, ".") ?? ""} ~ ${bizEnd?.replace(/-/g, ".") ?? ""}`
    : text(r.bizPrdEtcCn);
  const scale = Number(r.sprtSclCnt) || 0;

  const periodLabel = always
    ? "상시 모집"
    : period.start || period.end
      ? `${period.start?.replace(/-/g, ".") ?? "공고문 확인"} ~ ${period.end?.replace(/-/g, ".") ?? "공고문 확인"}`
      : periodText;

  // 지원 대상 한 줄: 추가 자격 조건이 있으면 그것, 없으면 코드값으로 만든다
  const targetLine = extraQual || [ageText, school.names.join("·"), job.names.join("·")].filter(Boolean).join(", ");

  const agency = clean(r.sprvsnInstCdNm) || clean(r.operInstCdNm) || "온통청년";
  const oper = clean(r.operInstCdNm);

  const details: PolicyDetailItem[] = [
    { label: "정책 소개", value: explain },
    { label: "지원 내용", value: support },
    { label: "지원 연령", value: ageText || (unknown.includes("age") ? "" : "제한 없음") },
    { label: "추가 자격 조건", value: extraQual },
    { label: "참여 제한 대상", value: excluded },
    { label: "소득 조건", value: incomeText },
    { label: "학력", value: school.names.join(", ") },
    { label: "취업 상태", value: job.names.join(", ") },
    { label: "전공", value: majors.join(", ") },
    { label: "특화 분야", value: specials.join(", ") },
    { label: "혼인 여부", value: marriage ? `${marriage}자` : "" },
    { label: "신청 기간", value: periodLabel },
    { label: "사업 기간", value: bizText },
    { label: "지원 규모", value: scale ? `${scale.toLocaleString("ko-KR")}명` : "" },
    { label: "신청 방법", value: method },
    { label: "심사 방법", value: screening },
    { label: "제출 서류", value: docs },
    { label: "기타", value: etc },
    { label: "운영 기관", value: oper && oper !== agency ? oper : "" },
  ].filter((d) => d.value);

  // 요약·매칭(특정 대상 판단)·검색이 읽는 원문. "항목: 내용" 한 줄씩
  const summaryRaw = [
    explain && `정책소개: ${oneLine(explain)}`,
    targetLine && `지원대상: ${oneLine(targetLine)}${marriage ? ` (혼인 조건: ${marriage})` : ""}`,
    support && `지원내용: ${oneLine(support)}`,
    incomeText && `소득조건: ${oneLine(incomeText)}`,
    periodLabel && `신청기간: ${periodLabel}`,
    method && `신청방법: ${oneLine(method)}`,
    screening && `심사방법: ${oneLine(screening)}`,
    docs && `제출서류: ${oneLine(docs)}`,
    excluded && `참여제한대상: ${oneLine(excluded)}`,
    etc && `기타: ${oneLine(etc)}`,
  ].filter(Boolean).join("\n");

  const applyUrl = httpUrl(r.aplyUrlAddr);
  const center = youthDetailUrl(plcyNo);
  const links = [
    applyUrl && { label: "신청 페이지", url: applyUrl },
    { label: "온통청년 상세", url: center },
    httpUrl(r.refUrlAddr1) && { label: "참고 사이트", url: httpUrl(r.refUrlAddr1) },
    httpUrl(r.refUrlAddr2) && { label: "참고 사이트 2", url: httpUrl(r.refUrlAddr2) },
  ].filter((l): l is { label: string; url: string } => !!l);

  return {
    id: `youth-${plcyNo}`,
    source: "youth",
    title,
    agency,
    category: category(r, title),
    regionCodes,
    ageMin,
    ageMax,
    incomeMax: null,
    studentStatus: school.values,
    employmentStatus: job.values,
    applyStart: period.start,
    applyEnd: period.end,
    isAlwaysOpen: period.always,
    summaryRaw,
    detailUrl: applyUrl || center,
    attachmentUrls: [],
    unknownFields: unknown,
    amountMax: parseAmountMax(support),
    details,
    keywords: codes(r.plcyKywdNm),
    links,
  };
}
