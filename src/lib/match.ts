import { ageRangeFromBirthYear, kstDate } from "./date";
import type { MatchResult, MatchStatus, Policy, UserProfile } from "./types";

// 강원·전북은 특별자치도 전환으로 코드가 바뀌었다 (42→51, 45→52). 옛 코드가 섞여 와도 같게 본다.
const LEGACY_SIDO: Record<string, string> = { "42": "51", "45": "52" };
export function normalizeRegionCode(code: string): string {
  const head = code.slice(0, 2);
  return LEGACY_SIDO[head] ? LEGACY_SIDO[head] + code.slice(2) : code;
}

type Verdict = "ok" | "unknown" | "fail";

function checkRegion(profile: UserProfile, policy: Policy): Verdict {
  if (policy.regionCodes.includes("ALL")) return "ok";
  if (policy.regionCodes.length === 0) return "unknown";
  const mine = normalizeRegionCode(profile.regionCode);
  const sido = mine.slice(0, 2);
  const hit = policy.regionCodes.some((raw) => {
    const c = normalizeRegionCode(raw);
    // 시·군·구 일치 또는 상위 시·도 일치
    return c === mine || c === sido || (c.length === 2 && c === sido);
  });
  return hit ? "ok" : "fail";
}

function checkAge(profile: UserProfile, policy: Policy, today: string): Verdict {
  const { ageMin, ageMax } = policy;
  if (ageMin == null && ageMax == null) return "ok";
  const [before, after] = ageRangeFromBirthYear(profile.birthYear, today);
  const inRange = (a: number) => (ageMin == null || a >= ageMin) && (ageMax == null || a <= ageMax);
  const a = inRange(before), b = inRange(after);
  if (a && b) return "ok";
  if (!a && !b) return "fail";
  return "unknown"; // 생일에 따라 달라지는 경계 나이
}

function checkPeriod(policy: Policy, today: string): Verdict {
  if (policy.isAlwaysOpen) return "ok";
  if (!policy.applyEnd) return "unknown";
  return policy.applyEnd >= today ? "ok" : "fail";
}

/**
 * 프로필과 정책을 비교해 신청 가능 / 조건 확인 필요 / 제외로 분류한다. (PRD 6-3)
 * - 나이·지역·신청 기간이 명확히 어긋나면 제외
 * - 판단할 수 없는 조건이 있거나 사용자가 "모름"을 골랐으면 확인 필요
 * - 그 외 조건(소득·학적·취업)이 어긋나면 기준 해석이 기관마다 달라 확인 필요로 둔다
 */
export function matchPolicy(profile: UserProfile, policy: Policy, today: string = kstDate()): MatchResult {
  const unknown = new Set(policy.unknownFields ?? []);
  const reasons: string[] = [];
  let excluded = false;

  const region = unknown.has("region") ? "unknown" : checkRegion(profile, policy);
  if (region === "fail") { excluded = true; reasons.push("거주 지역이 대상이 아니에요"); }
  else if (region === "unknown") reasons.push("지역 조건을 공고문에서 확인하세요");

  const age = unknown.has("age") ? "unknown" : checkAge(profile, policy, today);
  if (age === "fail") { excluded = true; reasons.push("나이가 대상 범위를 벗어나요"); }
  else if (age === "unknown") reasons.push("나이 조건을 확인하세요 (생일에 따라 달라질 수 있어요)");

  const period = unknown.has("period") ? "unknown" : checkPeriod(policy, today);
  if (period === "fail") { excluded = true; reasons.push("신청 기간이 지났어요"); }
  else if (period === "unknown") reasons.push("신청 기간을 공고문에서 확인하세요");

  if (unknown.has("income")) reasons.push("소득 조건을 공고문에서 확인하세요");
  else if (policy.incomeMax != null) {
    if (profile.incomeLevel == null) reasons.push("소득분위를 '모름'으로 골라 확인이 필요해요");
    else if (profile.incomeLevel > policy.incomeMax) reasons.push(`소득분위 ${policy.incomeMax}구간 이하 대상이에요`);
  }

  if (unknown.has("student")) reasons.push("학적 조건을 공고문에서 확인하세요");
  else if (policy.studentStatus && !policy.studentStatus.includes(profile.studentStatus)) {
    reasons.push(`학적 조건: ${policy.studentStatus.join("·")}`);
  }

  if (unknown.has("employment")) reasons.push("취업 상태 조건을 공고문에서 확인하세요");
  else if (policy.employmentStatus && !policy.employmentStatus.includes(profile.employmentStatus)) {
    reasons.push(`취업 상태 조건: ${policy.employmentStatus.join("·")}`);
  }

  const status: MatchStatus = excluded ? "excluded" : reasons.length > 0 ? "check" : "eligible";
  return { status, reasons: excluded ? reasons.filter((r) => !r.includes("확인")) : reasons };
}

export type MatchedPolicy = { policy: Policy } & MatchResult;

/** 신청 가능 → 확인 필요, 각 그룹 안에서 마감 임박순, 상시 모집·마감일 미정은 맨 뒤 */
export function sortMatched(list: MatchedPolicy[]): MatchedPolicy[] {
  const rank: Record<MatchStatus, number> = { eligible: 0, check: 1, excluded: 2 };
  const endKey = (p: Policy) => (p.isAlwaysOpen || !p.applyEnd ? "9999-12-31" : p.applyEnd);
  return [...list].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      endKey(a.policy).localeCompare(endKey(b.policy)) ||
      a.policy.title.localeCompare(b.policy.title, "ko"),
  );
}

export function matchAll(profile: UserProfile, policies: Policy[], today: string = kstDate()) {
  const matched = policies.map((policy) => ({ policy, ...matchPolicy(profile, policy, today) }));
  const visible = sortMatched(matched.filter((m) => m.status !== "excluded"));
  return {
    results: visible,
    counts: {
      eligible: visible.filter((m) => m.status === "eligible").length,
      check: visible.filter((m) => m.status === "check").length,
      excluded: matched.length - visible.length,
    },
  };
}
