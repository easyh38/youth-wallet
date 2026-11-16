import type { Policy } from "./types";

/**
 * 세 출처(온통청년·보조금24·장학재단)에 같은 정책이 겹쳐 들어오는 것을 합친다.
 *
 * 이름이 같다고 같은 정책이 아니다. "청년월세 지원"은 대구·경기·세종이 각각 따로 운영하고,
 * "청년문화예술패스"는 해마다 새로 공고된다. 그래서 아래 조건을 **모두** 만족할 때만 합친다.
 * 하나라도 애매하면 합치지 않는다 (겹쳐 보이는 것이 정책이 사라지는 것보다 낫다).
 *
 * 1. 정책명이 같다 (띄어쓰기·문장부호 차이만 무시)
 * 2. 대상 지역이 정확히 같다
 * 3. 기관이 서로 다르지 않다 ("대구광역시" ↔ "대구광역시 경제국 농산유통과"는 같은 곳으로 본다)
 * 4. 신청 시작일·마감일이 서로 다르지 않다 (둘 다 있는데 다르면 다른 해·다른 회차)
 */

const titleKey = (s: string) => s.replace(/[\s()[\]{}<>·ㆍ・‧,.'"‘’“”\-_/~]/g, "").toLowerCase();

/** "충청남도 천안시청" → "충청남도천안시", "인천광역시청" → "인천광역시". 부서 이름뿐이면 알 수 없음(null) */
function orgKey(agency: string): string | null {
  const a = agency.replace(/[()[\]]/g, " ").replace(/\(?재\)|재단법인|사단법인/g, "").trim();
  if (!a) return null;
  const words = a.split(/\s+/);
  // "농정전략과", "청년정책담당관"처럼 상위 기관 없이 부서만 적힌 경우
  if (/(과|국|실|팀|담당관|관)$/.test(words[0])) return null;
  // 기관명 뒤에 붙은 부서(…국, …과)는 뺀다
  const org = words.filter((w, i) => i === 0 || !/(과|국|실|팀|담당관|본부)$/.test(w));
  return org.join("").replace(/(시|군|구|도)청$/, "$1").toLowerCase();
}

function sameAgency(a: string, b: string): boolean {
  const x = orgKey(a);
  const y = orgKey(b);
  if (x === null || y === null) return true;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

const regionKey = (codes: string[]) => [...new Set(codes)].sort().join(",");

/**
 * 날짜가 다르면 다른 해·다른 회차로 본다.
 * 출처가 다르면 한쪽만 비어 있는 것은 허용한다 (보조금24는 원래 날짜를 거의 주지 않는다).
 * 같은 출처 안에서는 날짜가 있는 것과 없는 것이 따로 등록된 경우가 많아(해마다 새로 등록) 완전히 같아야 한다.
 */
function datesConflict(a: Policy, b: Policy): boolean {
  const strict = a.source === b.source;
  const differ = (x: string | null, y: string | null) => (strict ? (x ?? "") !== (y ?? "") : !!x && !!y && x !== y);
  return differ(a.applyStart, b.applyStart) || differ(a.applyEnd, b.applyEnd);
}

export function isSamePolicy(a: Policy, b: Policy): boolean {
  if (titleKey(a.title) !== titleKey(b.title)) return false;
  // 지역을 알 수 없는 정책끼리는 비교할 근거가 없다
  if (!a.regionCodes.length || !b.regionCodes.length) return false;
  if (regionKey(a.regionCodes) !== regionKey(b.regionCodes)) return false;
  if (!sameAgency(a.agency, b.agency)) return false;
  if (datesConflict(a, b)) return false;
  return true;
}

/**
 * 앞 목록이 우선한다 (온통청년 → 보조금24 → 장학재단).
 * aliases: 합쳐져 사라진 정책 ID → 남은 정책 ID (예전에 저장한 링크가 깨지지 않도록)
 */
export function dedupePolicies(lists: Policy[][]): { policies: Policy[]; aliases: Map<string, string> } {
  const kept: Policy[] = [];
  const byTitle = new Map<string, Policy[]>();
  const ids = new Set<string>();
  const aliases = new Map<string, string>();
  for (const list of lists) {
    for (const p of list) {
      if (!p.title || ids.has(p.id)) continue;
      const key = titleKey(p.title);
      const same = byTitle.get(key)?.find((q) => isSamePolicy(q, p));
      if (same) {
        aliases.set(p.id, same.id);
        continue;
      }
      kept.push(p);
      ids.add(p.id);
      byTitle.set(key, [...(byTitle.get(key) ?? []), p]);
    }
  }
  return { policies: kept, aliases };
}
