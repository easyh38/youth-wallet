import type { Policy } from "./types";

// 띄어쓰기 차이("학자금대출" / "학자금 대출")를 무시하고 비교한다
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export function searchTokens(query: string): string[] {
  return query.trim().split(/\s+/).map(norm).filter(Boolean);
}

/**
 * 검색어의 모든 단어가 정책명·기관명·설명 어딘가에 들어 있으면 0 이상, 아니면 -1.
 * 정책명에 들어 있는 단어가 많을수록 점수가 높다 (정책명이 맞는 것을 먼저 보여 주려고).
 */
export function searchScore(policy: Pick<Policy, "title" | "agency" | "summaryRaw">, tokens: string[]): number {
  if (!tokens.length) return 0;
  const title = norm(policy.title);
  const all = title + norm(policy.agency) + norm(policy.summaryRaw);
  let score = 0;
  for (const t of tokens) {
    if (!all.includes(t)) return -1;
    if (title.includes(t)) score += 1;
  }
  // 검색어 전체가 정책명에 붙어서 나오면 가장 앞으로
  if (title.includes(tokens.join(""))) score += tokens.length;
  return score;
}

/** 검색어에 맞는 항목만 남기고 점수가 높은 순으로. 점수가 같으면 원래 순서(매칭 결과 정렬)를 지킨다 */
export function searchPolicies<T extends { policy: Pick<Policy, "title" | "agency" | "summaryRaw"> }>(list: T[], query: string): T[] {
  const tokens = searchTokens(query);
  if (!tokens.length) return list;
  return list
    .map((item, i) => ({ item, i, s: searchScore(item.policy, tokens) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}
