// 한국장학재단 학자금 지원 정보 (공공데이터포털 CSV 또는 자동 변환 API)
// 수기로 모은 파일 데이터라 실시간이 아니며 일부 기관만 포함된다. 하루 1회 받아 저장한다.

import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import type { Policy, UnknownField } from "../types";
import { normalizeDate } from "../date";
import { clean, parseAmountMax, pushUnknown, regionsFromRegionText } from "./parse";

type Raw = Record<string, unknown>;

export function kosafConfigured() {
  return Boolean((process.env.KOSAF_API_URL && process.env.KOSAF_API_KEY) || process.env.KOSAF_PUBLIC_FILE_URL);
}

const MAX_CSV_BYTES = 8 * 1024 * 1024;

async function fetchPublicFile(url: URL): Promise<Policy[]> {
  if (url.origin !== "https://www.data.go.kr" || url.pathname !== "/cmm/cmm/fileDownload.do" || url.username || url.password) {
    throw new Error("kosaf: 공공데이터포털의 파일 다운로드 주소가 필요해요");
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`kosaf CSV HTTP ${response.status}`);

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CSV_BYTES) {
      await reader.cancel();
      throw new Error("kosaf: CSV 용량 제한을 넘었어요");
    }
    chunks.push(value);
  }

  const bytes = Buffer.concat(chunks);
  let csv: string;
  try {
    csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    csv = iconv.decode(bytes, "cp949");
  }
  const rows = parse(csv, { bom: true, columns: true, skip_empty_lines: true }) as Raw[];
  const policies = rows.filter((row) => pick(row, "번호") && pick(row, "상품명")).map(normalizeKosaf);
  if (!policies.length) throw new Error("kosaf: CSV에서 학자금 공고를 읽지 못했어요");
  return policies;
}

export async function fetchKosaf(): Promise<Policy[]> {
  const url = process.env.KOSAF_API_URL;
  const key = process.env.KOSAF_API_KEY;
  if (!url || !key) {
    const fileUrl = process.env.KOSAF_PUBLIC_FILE_URL;
    if (!fileUrl) throw new Error("kosaf: REST 또는 공개 CSV 주소를 설정해 주세요");
    return fetchPublicFile(new URL(fileUrl));
  }
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

const KOSAF_HOME = "https://www.kosaf.go.kr";

/** 주소 바로 뒤에 "?" 없이 붙은 파라미터 ("scholar.dopg=…") */
const MISSING_QUERY = /\.(do|jsp|php|aspx?|html?)(?=[A-Za-z_][\w-]*=)/i;

/**
 * 파일데이터를 사람이 직접 입력해서 홈페이지 주소가 깨져 오는 경우가 많다. 알아볼 수 있는 것만 고친다.
 * - "…/scholar.dopg=x&naviParam=y" → "…/scholar.do?pg=x&naviParam=y" (재단 자체 상품 대부분이 이렇다)
 * - "http//", "https:/", "http;//", "htps://", "https:abc" → 올바른 http(s)://
 * - "www.abc.or.kr"처럼 http가 빠진 주소 → "http://…"를 붙인다 (오래된 기관 사이트는 https가 안 되기도 한다)
 * - "3. https://…"처럼 앞에 다른 글자가 붙은 주소 → 주소만
 * 주소로 볼 수 없으면 ("해당없음" 등) 빈 문자열
 */
export function repairUrl(raw: string): string {
  let u = raw.trim();
  const inText = u.match(/https?:\/\/\S+/i);
  if (inText) u = inText[0];
  // 깨진 http(s) 머리: 구분 문자(: ; /)가 하나는 있어야 한다 ("httpbin.org" 같은 도메인을 건드리지 않도록)
  u = u.replace(/^(h?t?tps?)(?:[:;]+\/*|\/+)/i, (_, scheme: string) => (/s$/i.test(scheme) ? "https://" : "http://"));
  if (!/^https?:\/\//i.test(u)) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(u)) return "";
    u = "http://" + u;
  }
  if (!u.includes("?")) {
    // 일부 구청은 사이트 이름을 확장자로 쓴다 ("dongnae.go.kr/index.dongnae?contentsSid=…")
    const site = u.match(/^https?:\/\/(?:www\.)?([a-z0-9-]+)\./i)?.[1];
    const own = site && new RegExp(`\\.(${site})(?=[A-Za-z_][\\w-]*=)`, "i");
    u = own && own.test(u) ? u.replace(own, ".$1?") : u.replace(MISSING_QUERY, ".$1?");
  }
  return u;
}

/** 위 수리를 하기 전에 저장된 캐시는 다시 받는다 */
export const kosafCacheCurrent = (cached: Policy[]) => cached.every((p) => /^https?:\/\//i.test(p.detailUrl) && !(!p.detailUrl.includes("?") && MISSING_QUERY.test(p.detailUrl)));

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

  const regionCodes = !regionText || /해당\s*없|무관|제한\s*없/.test(regionText) ? ["ALL"] : regionsFromRegionText(regionText, org);
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
    detailUrl: repairUrl(pick(r, "홈페이지 주소")) || KOSAF_HOME,
    attachmentUrls: [],
    unknownFields: unknown,
    amountMax: parseAmountMax(support),
  };
}
