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
 * 프로필에서 묻지 않는 특정 대상 조건. 정책명이나 지원대상에 이런 말이 있으면
 * 사용자가 해당되는지 알 수 없으므로 "신청 가능"이 아니라 "조건 확인 필요"로 둔다.
 */
export const SPECIAL_TARGETS: { label: string; re: RegExp }[] = [
  { label: "북한이탈주민", re: /북한\s*이탈|탈북|새터민/ },
  { label: "자립준비청년(보호종료아동)", re: /자립\s*준비|보호\s*종료|보호\s*대상\s*아동|가정\s*위탁|아동\s*양육\s*시설/ },
  // "경도인지장애" 같은 질환명은 빼고 장애인·장애학생 등만
  { label: "장애인", re: /장애인|장애\s*(?:아동|학생|대학|청년|가구|가정|정도|등급)|발달\s*장애/ },
  // "구직급여 수급자"는 실업급여라서 해당 없음. 기초생활보장 급여 수급만
  { label: "기초생활수급자·차상위계층", re: /기초\s*생활|생계\s*급여|의료\s*급여|주거\s*급여|교육\s*급여|차상위/ },
  { label: "한부모·조손가정", re: /한\s*부모|조손/ },
  { label: "다문화가족·결혼이민자", re: /다문화|결혼\s*이민|이주\s*배경/ },
  { label: "국가유공자·보훈대상자", re: /유공자|보훈|참전/ },
  { label: "유가족·유자녀", re: /유가족|유족|유자녀/ },
  // "영농 기술을 배우려는 청년"처럼 누구나 되는 경우가 있어 '영농'은 뺀다
  { label: "농어업인", re: /농업인|어업인|임업인|귀농|귀어|후계\s*농/ },
  { label: "신혼부부·임신·출산·자녀양육 가구", re: /신혼\s*부부|임산부|임신|출산|다자녀|영유아/ },
  // "경기도 전역"의 '전역'은 빼고 전역 예정자·제대군인만
  { label: "군 장병·제대군인", re: /장병|제대\s*군인|군\s*복무|전역\s*(?:예정|장병|군인|간부|자)/ },
  { label: "특정 직업 종사자", re: /종사자|교직원|건설\s*노동자|운전자/ },
];

/** 정책명 + 지원대상 문장 (선정기준의 "우대" 같은 부가 조건까지 보지 않도록 지원대상만) */
function targetText(policy: Policy): string {
  const line = policy.summaryRaw.match(/^지원\s*대상\s*[:：]\s*([^\n]+)/m)?.[1];
  return `${policy.title}\n${line ?? policy.summaryRaw.slice(0, 300)}`;
}

export function specialTargets(policy: Policy): string[] {
  const text = targetText(policy);
  // "영유아, 청소년, 청년, 노인 등 전 국민 대상"처럼 누구나 되는 정책은 특정 대상이 아니다
  if (/전\s*국민|국민\s*누구나|누구나/.test(text)) return [];
  return SPECIAL_TARGETS.filter((t) => t.re.test(text)).map((t) => t.label);
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

  const special = specialTargets(policy);
  // "청년, 신혼부부, 한부모가족"처럼 여러 대상 중 하나일 수도 있어 '대상'이라고 단정하지 않는다
  if (special.length) reasons.push(`${special.join(", ")} 관련 조건이 있어요. 해당되는지 확인하세요`);

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
