// 온통청년 청년정책 API (한국고용정보원)
// 실제 요청 파라미터·응답 필드는 API 상세 명세를 보고 확정한다. (PRD 8. 제약 사항)
// 아래 필드명은 2025년 개편된 청년정책 API(getPlcy) 기준이다.

import type { Policy, UnknownField } from "../types";
import { clean, inferCategory, parseAgeRange, parseAmountMax, parsePeriod, pushUnknown } from "./parse";

type Raw = Record<string, unknown>;

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export async function fetchYouth(): Promise<Policy[]> {
  const key = process.env.YOUTH_API_KEY!;
  const base = process.env.YOUTH_API_URL || "https://www.youthcenter.go.kr/go/ythip/getPlcy";
  const all: Raw[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${base}?apiKeyNm=${encodeURIComponent(key)}&pageNum=${page}&pageSize=${PAGE_SIZE}&rtnType=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) throw new Error(`youth HTTP ${res.status}`);
    const json = (await res.json()) as { result?: { youthPolicyList?: Raw[]; pagging?: { totCount?: number } } };
    const list = json.result?.youthPolicyList ?? [];
    all.push(...list);
    const total = json.result?.pagging?.totCount ?? 0;
    if (list.length < PAGE_SIZE || all.length >= total) break;
  }
  return all.map(normalizeYouth);
}

const SCHOOL_MAP: Record<string, string[]> = {
  재학: ["재학"], 휴학: ["휴학"], 졸업예정: ["졸업예정"], 졸업: ["졸업"],
};
const JOB_MAP: Record<string, string> = {
  미취업: "미취업", 재직: "재직", 근로: "재직", 창업: "창업 준비", 예비창업: "창업 준비", 자영업: "자영업",
};

function names(raw: unknown): string[] {
  return clean(raw).split(/[,\s]+/).filter(Boolean);
}

export function normalizeYouth(r: Raw): Policy {
  const unknown: UnknownField[] = [];
  const title = clean(r.plcyNm);
  const desc = [r.plcyExplnCn, r.plcySprtCn, r.addAplyQlfcCndCn, r.ptcpPrpTrgtCn].map(clean).filter(Boolean).join("\n");

  // 나이: 숫자 필드가 있으면 우선, 없으면 텍스트에서
  const minN = Number(r.sprtTrgtMinAge), maxN = Number(r.sprtTrgtMaxAge);
  let ageMin: number | null = minN > 0 ? minN : null;
  let ageMax: number | null = maxN > 0 ? maxN : null;
  if (ageMin == null && ageMax == null && clean(r.sprtTrgtAgeLmtYn) !== "N") {
    const a = parseAgeRange(desc);
    ageMin = a.min; ageMax = a.max;
    pushUnknown(unknown, !a.found, "age");
  }

  // 지역: zipCd 는 쉼표로 구분된 법정 시·군·구 코드
  const zips = names(r.zipCd).filter((z) => /^\d{5}$/.test(z));
  const regionCodes = zips.length ? zips : clean(r.zipCd) ? [] : ["ALL"];

  // 신청 기간
  const periodText = clean(r.aplyYmd);
  const always = clean(r.aplyPrdSeCd).endsWith("002") || /상시/.test(periodText);
  const period = always ? { start: null, end: null, always: true } : parsePeriod(periodText);
  pushUnknown(unknown, !period.always && !period.end, "period");

  // 소득: 숫자로 정해진 분위 기준은 거의 없어 문장이 있으면 확인 필요
  const earn = clean(r.earnEtcCn) || clean(r.earnCndSeCd);
  pushUnknown(unknown, !!earn && !/무관|제한없/.test(earn), "income");

  const school = names(r.schoolCdNm ?? r.schoolCd).flatMap((s) => SCHOOL_MAP[s] ?? []);
  const job = names(r.jobCdNm ?? r.jobCd).map((s) => JOB_MAP[s]).filter(Boolean);

  return {
    id: `youth-${clean(r.plcyNo)}`,
    source: "youth",
    title,
    agency: clean(r.sprvsnInstCdNm) || clean(r.operInstCdNm) || "온통청년",
    category: inferCategory(clean(r.lclsfNm), clean(r.mclsfNm), title),
    regionCodes,
    ageMin,
    ageMax,
    incomeMax: null,
    studentStatus: school.length ? [...new Set(school)] : null,
    employmentStatus: job.length ? [...new Set(job)] : null,
    applyStart: period.start,
    applyEnd: period.end,
    isAlwaysOpen: period.always,
    summaryRaw: desc,
    detailUrl: clean(r.aplyUrlAddr) || clean(r.refUrlAddr1) || `https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/${clean(r.plcyNo)}`,
    attachmentUrls: [],
    unknownFields: unknown,
    amountMax: parseAmountMax(desc),
  };
}
