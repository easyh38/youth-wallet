// 한국장학재단 학자금 지원 정보 (공공데이터포털 파일데이터 → 자동 변환 API)
// 수기로 모은 파일 데이터라 실시간이 아니며 일부 기관만 포함된다. 하루 1회 받아 저장한다.

import type { Policy, UnknownField } from "../types";
import { normalizeDate } from "../date";
import { clean, parseAmountMax, pushUnknown, regionsFromText } from "./parse";

type Raw = Record<string, unknown>;

export async function fetchKosaf(): Promise<Policy[]> {
  const url = process.env.KOSAF_API_URL!;
  const key = process.env.KOSAF_API_KEY!;
  const all: Raw[] = [];
  for (let page = 1; page <= 10; page++) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}page=${page}&perPage=1000&returnType=JSON&serviceKey=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`kosaf HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Raw[]; totalCount?: number };
    const data = json.data ?? [];
    all.push(...data);
    if (data.length < 1000 || all.length >= (json.totalCount ?? 0)) break;
  }
  return all.map(normalizeKosaf);
}

const pick = (r: Raw, ...keys: string[]) => keys.map((k) => clean(r[k])).find(Boolean) ?? "";

export function normalizeKosaf(r: Raw, index = 0): Policy {
  const unknown: UnknownField[] = [];
  const org = pick(r, "운영기관명");
  const name = pick(r, "상품명");
  const income = pick(r, "소득기준 상세내용");
  const regionText = pick(r, "지역거주여부 상세내용");
  const support = pick(r, "지원내역 상세내용");
  const docs = pick(r, "제출서류 상세내용");
  const qualify = pick(r, "특정자격 상세내용");
  const grade = pick(r, "성적기준 상세내용");

  // 학자금 지원구간 "8구간 이하" 같은 명확한 표현만 숫자로
  const m = income.match(/(\d{1,2})\s*구간\s*이하/);
  const incomeMax = m ? +m[1] : null;
  pushUnknown(unknown, !m && !!income && !/해당\s*없|무관|제한\s*없/.test(income), "income");

  const regionCodes = !regionText || /해당\s*없|무관|제한\s*없/.test(regionText) ? ["ALL"] : regionsFromText(regionText) ?? [];
  pushUnknown(unknown, regionCodes.length === 0, "region");

  const start = normalizeDate(pick(r, "모집시작일"));
  const end = normalizeDate(pick(r, "모집종료일"));
  pushUnknown(unknown, !end, "period");

  const summaryRaw = [
    qualify && `지원대상: ${qualify}`,
    income && `소득기준: ${income}`,
    grade && `성적기준: ${grade}`,
    regionText && `지역기준: ${regionText}`,
    support && `지원내용: ${support}`,
    pick(r, "선발방법 상세내용") && `선발방법: ${pick(r, "선발방법 상세내용")}`,
    docs && `제출서류: ${docs}`,
  ].filter(Boolean).join("\n");

  return {
    id: `kosaf-${pick(r, "번호") || index}`,
    source: "kosaf",
    title: name,
    agency: org || "한국장학재단",
    category: "scholarship",
    regionCodes,
    ageMin: null,
    ageMax: null,
    incomeMax,
    studentStatus: /졸업/.test(qualify) ? null : ["재학", "휴학", "졸업예정"],
    employmentStatus: null,
    applyStart: start,
    applyEnd: end,
    isAlwaysOpen: false,
    summaryRaw,
    detailUrl: pick(r, "홈페이지 주소") || "https://www.kosaf.go.kr",
    attachmentUrls: [],
    unknownFields: unknown,
    amountMax: parseAmountMax(support),
  };
}
