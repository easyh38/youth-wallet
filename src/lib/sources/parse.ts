// 공공 API 원문에서 조건을 뽑는 보조 함수.
// 원칙: 확실히 읽히는 것만 숫자로 바꾸고, 애매하면 null + unknownFields 로 둔다. (PRD 6-2)

import { normalizeDate } from "../date";
import { REGIONS, SIDO_ALIASES, allSigungu } from "../regions";
import type { Category, UnknownField } from "../types";

export function clean(s: unknown): string {
  return String(s ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

/** "만 19세 ~ 34세", "19세 이상 39세 이하", "만 34세 이하" */
export function parseAgeRange(text: string): { min: number | null; max: number | null; found: boolean } {
  const t = text.replace(/\s/g, "");
  const range = t.match(/만?(\d{2})세?(?:이상)?[~∼\-–부터]+만?(\d{2})세/);
  if (range) return { min: +range[1], max: +range[2], found: true };
  const min = t.match(/만?(\d{2})세이상/);
  const max = t.match(/만?(\d{2})세(?:이하|미만)/);
  if (min || max) {
    const maxVal = max ? +max[1] - (max[0].includes("미만") ? 1 : 0) : null;
    return { min: min ? +min[1] : null, max: maxVal, found: true };
  }
  const mentionsAge = /연령|나이|세\s*(?:이상|이하)|청년/.test(text);
  return { min: null, max: null, found: !mentionsAge };
}

/** "2026.03.01 ~ 2026.03.31", "20260301 ~ 20260331" */
export function parsePeriod(text: string): { start: string | null; end: string | null; always: boolean } {
  if (/상시|연중|수시/.test(text)) return { start: null, end: null, always: true };
  const parts = text.split(/[~∼]|부터/);
  if (parts.length >= 2) return { start: normalizeDate(parts[0]), end: normalizeDate(parts[1]), always: false };
  const one = normalizeDate(text);
  return { start: null, end: one, always: false };
}

/** 텍스트에서 시·도 이름을 찾아 2자리 코드로. 못 찾으면 null */
export function regionsFromText(text: string): string[] | null {
  if (/전국|제한\s*없/.test(text)) return ["ALL"];
  const codes = new Set<string>();
  for (const [name, code] of Object.entries(SIDO_ALIASES)) if (text.includes(name)) codes.add(code);
  // 전남광주통합특별시: 옛 광주광역시(29)와 전라남도(46) 지역을 모두 포함한다
  if (/전남광주/.test(text)) { codes.add("29"); codes.add("46"); }
  return codes.size ? [...codes] : null;
}

/**
 * 보조금24 소관기관(명·유형)으로 대상 지역을 정한다.
 * - 시군구: "서울특별시 강서구" → 해당 시·군·구 코드. 지역 표에 없는 시·군·구는 "41:연천군" 형태로 둔다
 *   (사용자는 표에 있는 시·군·구만 고를 수 있으므로 누구와도 일치하지 않아 제외된다)
 * - 광역시도·교육청: 시·도 코드
 * - 출자·출연기관, 지방공기업: 기관 이름 앞부분의 지역명으로 정한다 ("대전일자리경제진흥원" → 대전).
 *   이름에 지역이 없으면 [] (조건 확인 필요)
 * - 중앙행정기관·공공기관 등: 전국
 */
export function regionsFromAgency(agency: string, type: string): string[] {
  const local = /시군구|광역시도|교육청|지방|지자체/.test(type);
  if (!local) return ["ALL"];
  const sidoCodes = regionsFromText(agency.split(/\s+/)[0] ?? "")?.filter((c) => c !== "ALL") ?? [];
  if (/시군구/.test(type)) {
    const name = agency.trim().split(/\s+/)[1];
    if (!name || !sidoCodes.length) return [];
    for (const sido of sidoCodes) {
      const hit = allSigungu(sido).find((g) => g.name === name);
      if (hit) return [hit.code];
    }
    return [`${sidoCodes[0]}:${name}`];
  }
  if (/광역시도|교육청/.test(type)) return sidoCodes;
  return regionsFromName(agency);
}

// 이름 앞에 오는 시·도 표기. 긴 것부터 맞춰 본다 ("경상북도"가 "경북"보다 먼저)
const SHORT_FORMS = ["경기도", "강원도", "제주도", "서울시", "부산시", "대구시", "인천시", "대전시", "울산시", "세종시"];
const SIDO_PREFIXES: [string, string[]][] = (
  [
    ["전남광주통합특별시", ["29", "46"]],
    ...REGIONS.map((r): [string, string[]] => [r.name, [r.code]]),
    ...Object.entries(SIDO_ALIASES).map(([name, code]): [string, string[]] => [name, [code]]),
    ...SHORT_FORMS.map((name): [string, string[]] => [name, [SIDO_ALIASES[name.slice(0, 2)]]]),
  ] as [string, string[]][]
).sort((a, b) => b[0].length - a[0].length);

const ORG_PREFIX = /^(?:\s|\(재\)|\(사\)|\(주\)|재단법인|사단법인|주식회사)+/;
const NOT_AFTER_HANGUL = "(?<![가-힣])";

/** "광주시"만 보고는 경기 광주시인지 광주광역시인지 모른다. 경기 힌트가 없으면 둘 다 둔다 */
function withGwangjuAmbiguity(codes: string[], sidoHint: string[]): string[] {
  if (codes.includes("41610") && !sidoHint.includes("41") && !codes.includes("29")) return [...codes, "29"];
  return codes;
}

/** 이름 맨 앞이 시·군·구 이름(또는 "목포"처럼 시·군·구를 뗀 두 글자 이상)이면 그 코드 */
function sigunguAtStart(text: string, sidoCodes: string[]): string[] {
  const out: string[] = [];
  for (const sido of sidoCodes) {
    for (const g of allSigungu(sido)) {
      const stem = g.name.slice(0, -1);
      if (text.startsWith(g.name) || (stem.length >= 2 && text.startsWith(stem))) out.push(g.code);
    }
  }
  return out;
}

const ALL_SIDO_CODES = REGIONS.map((r) => r.code);

/**
 * 기관 이름으로 지역을 정한다. 이름 맨 앞만 본다 (중간에 나오는 단어는 지역명이 아닐 수 있어서).
 * "경북신용보증재단" → 경북, "(재)대구동구교육재단" → 대구 동구, "횡성인재육성장학회" → 강원 횡성군
 * 못 찾으면 []
 */
export function regionsFromName(name: string): string[] {
  const s = name.replace(ORG_PREFIX, "");
  const prefix = SIDO_PREFIXES.find(([p]) => s.startsWith(p));
  if (prefix) {
    const [p, sidoCodes] = prefix;
    const rest = s.slice(p.length).replace(/^(?:특별자치시|특별자치도|특별시|광역시|도)?\s*/, "");
    const sg = sigunguAtStart(rest, sidoCodes);
    return sg.length ? sg : sidoCodes;
  }
  return withGwangjuAmbiguity(sigunguAtStart(s, ALL_SIDO_CODES), []);
}

/** 텍스트 안에 나오는 시·군·구 전체 이름("원주시", "고성군")을 찾는다. sidoHint가 있으면 그 시·도 안에서만 */
export function sigunguInText(text: string, sidoHint: string[] = []): string[] {
  const sidos = sidoHint.length ? sidoHint : ALL_SIDO_CODES;
  const out: string[] = [];
  for (const sido of sidos) {
    for (const g of allSigungu(sido)) {
      // "강남구" 안의 "남구"처럼 다른 이름의 일부로 들어간 경우는 뺀다
      if (new RegExp(NOT_AFTER_HANGUL + g.name).test(text)) out.push(g.code);
    }
  }
  return withGwangjuAmbiguity(out, sidoHint);
}

/**
 * 장학금 지역 기준 문구 + 운영기관 이름으로 대상 지역을 정한다.
 * 1) 문구에 시·군·구 이름이 있으면 그 시·군·구  2) 시·도 이름이 있으면 그 시·도
 * 3) "관내 거주"처럼 지역명이 없으면 운영기관 이름의 지역  4) 그래도 없으면 [] (조건 확인 필요)
 */
export function regionsFromRegionText(text: string, org: string): string[] {
  const fromText = regionsFromText(text);
  if (fromText?.includes("ALL")) return ["ALL"];
  const fromOrg = regionsFromName(org);
  const hint = [...new Set([...(fromText ?? []), ...fromOrg.map((c) => c.slice(0, 2))])];
  const sg = sigunguInText(text, hint);
  if (sg.length) return sg;
  return fromText ?? fromOrg;
}

const CATEGORY_RULES: [Category, RegExp][] = [
  ["scholarship", /장학|학자금|등록금|교육비/],
  ["housing", /주거|월세|전세|임대|주택|자취|보증금/],
  ["startup", /창업|사업화|스타트업/],
  ["job", /취업|일자리|구직|채용|인턴|직업훈련|고용/],
  ["welfare", /복지|생활|문화|건강|의료|교통|금융|자산|저축/],
];

export function inferCategory(...texts: string[]): Category {
  const t = texts.join(" ");
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat;
  return "etc";
}

/** "월 최대 20만원", "최대 1,000만 원" → 원 단위 숫자. 확실한 '최대 N만원' 형태만 */
export function parseAmountMax(text: string): number | null {
  const m = text.replace(/,/g, "").match(/최대\s*(\d+(?:\.\d+)?)\s*(억|천만|만)\s*원/);
  if (!m) return null;
  const unit = m[2] === "억" ? 1e8 : m[2] === "천만" ? 1e7 : 1e4;
  let won = Math.round(+m[1] * unit);
  // "월 최대 20만원 12개월" 처럼 기간이 함께 적힌 경우 총액으로
  const months = text.match(/월\s*최대[^.\n]*?(\d{1,2})\s*개월/);
  if (months && /월\s*최대/.test(text)) won *= +months[1];
  return won;
}

export function pushUnknown(arr: UnknownField[], cond: boolean, field: UnknownField) {
  if (cond && !arr.includes(field)) arr.push(field);
}
