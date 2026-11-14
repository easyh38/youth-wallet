// 보조금24 공공서비스 목록 API (행정안전부, api.odcloud.kr)
// 청년과 무관한 서비스는 걸러낸다.

import type { Policy, UnknownField } from "../types";
import { clean, inferCategory, parseAgeRange, parseAmountMax, parsePeriod, pushUnknown, regionsFromAgency } from "./parse";

type Raw = Record<string, unknown>;

// 전체 약 1.1만 건을 끝까지 읽는다 (1,000건 ≈ 0.5초·1.9MB). 결과는 6시간 캐싱된다.
// MAX_PAGES는 API가 totalCount를 잘못 줄 때 무한 반복을 막는 안전장치
const PER_PAGE = 1000;
const MAX_PAGES = 30;
const YOUTH_RE = /청년|대학생|대학원생|사회초년|신혼|구직|취업준비|자립준비/;

export async function fetchGov24(): Promise<Policy[]> {
  const key = process.env.GOV24_API_KEY!;
  const base = process.env.GOV24_API_URL || "https://api.odcloud.kr/api/gov24/v3/serviceList";
  const all: Raw[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${base}?page=${page}&perPage=${PER_PAGE}&returnType=JSON&serviceKey=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!res.ok) throw new Error(`gov24 HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Raw[]; totalCount?: number };
    const data = json.data ?? [];
    all.push(...data);
    if (data.length < PER_PAGE || all.length >= (json.totalCount ?? 0)) break;
  }
  return all
    .filter((r) => YOUTH_RE.test(`${clean(r["서비스명"])} ${clean(r["지원대상"])} ${clean(r["서비스목적요약"])}`))
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
