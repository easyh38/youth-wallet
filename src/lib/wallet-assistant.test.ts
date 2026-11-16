import { describe, expect, it } from "vitest";
import { formatWon } from "./format";
import { eligibleAmountOf, matchAll } from "./match";
import { samplePolicies } from "./sources/sample";
import { assistantReply, type AssistantContext } from "./wallet-assistant";

const today = "2026-11-16";
const sources = ["youth", "gov24", "kosaf"] as const;
const policies = sources.flatMap((source) => samplePolicies(source, today));
const monthlyRent = policies[0];
const context: AssistantContext = {
  pathname: "/policies",
  policies,
  sampleSources: sources,
  profile: {
    regionCode: "11110",
    birthYear: 2002,
    incomeLevel: 5,
    studentStatus: "재학",
    employmentStatus: "미취업",
    interests: ["주거", "장학금"],
  },
  today,
};

describe("wallet assistant", () => {
  it("answers about the detail in the dashboard split view and cites the policy", () => {
    const page = { ...context, policyQuery: { search: monthlyRent.title, selectedPolicyId: monthlyRent.id } };

    for (const question of ["어떤 서류가 필요해요?", "이 정책 서류 어디서 확인해요?"]) {
      const result = assistantReply(question, page);
      expect(result.topic).toBe("policies");
      expect(result.answer).toContain("임대차계약서 사본");
      expect(result.answer).toContain("연습용");
      expect(result.policies).toEqual([{ id: monthlyRent.id, title: monthlyRent.title, source: "youth", sample: true }]);
    }
    expect(assistantReply("지금 보고 있는 정책을 설명해 줘", page).answer).toContain("월 최대 20만원");
  });

  it("uses dashboard filters for a screen question and searches elsewhere for a named category", () => {
    const page: AssistantContext = { ...context, policyQuery: { category: "housing", status: "check", sources: ["youth"], search: monthlyRent.title } };
    const dashboard = assistantReply("여기 뭐 있어?", page);
    expect(dashboard.policies.map(({ id }) => id)).toEqual([monthlyRent.id]);

    const changedTopic = assistantReply("신청할 수 있는 장학금 찾아줘", page);
    expect(changedTopic.policies.length).toBeGreaterThan(0);
    expect(changedTopic.evidence.every(({ category, matchStatus }) => category === "scholarship" && matchStatus === "eligible")).toBe(true);
  });

  it("explains the dashboard's global amount and counts with the same calculation as the match route", () => {
    const page: AssistantContext = { ...context, policyQuery: { category: "housing", sources: [] } };
    const { results, counts } = matchAll(context.profile!, policies, today);
    const amount = formatWon(eligibleAmountOf(results));
    const result = assistantReply("여기 최대 지원금은 어떻게 계산해?", page);
    expect(result.answer).toContain(`최대 지원금은 ${amount}`);
    expect(result.answer).toContain("숫자로 표시된 최대 금액을 더한 값");
    expect(assistantReply("이 화면의 신청 가능 건수는 뭐야?", page).answer).toContain(`신청 가능 ${counts.eligible}건`);
    expect(result.evidence).toEqual([]);
  });

  it("reuses the policy topic from the previous question for a short follow-up", () => {
    const page = { ...context, pathname: "/" };
    const question = "내 조건에 맞는 월세 지원 찾아줘";
    expect(assistantReply("그건 얼마야?", page, question).answer).toContain("월 최대 20만원");
    expect(assistantReply("신청은 어디서?", page, question).answer).toContain("복지로 누리집");
  });

  it("distinguishes a future opening from eligibility and reports the start date", () => {
    const future = { ...monthlyRent, applyStart: "2026-11-17", unknownFields: [], category: "housing" as const };
    const page = { ...context, policies: [future] };
    const result = assistantReply(`${future.title} 마감일 알려줘`, page);
    expect(result.evidence[0]?.matchStatus).toBe("check");
    expect(result.answer).toContain("2026.11.17 신청 시작");
    expect(assistantReply("신청 가능한 정책만 찾아줘", page).policies).toEqual([]);
  });

  it("requires a profile before stating personal eligibility", () => {
    const result = assistantReply("신청할 수 있는 장학금 찾아줘", { ...context, profile: null });
    expect(result.answer).toContain("내 조건을 입력하면");
    expect(result.policies).toEqual([]);
    expect(result.links?.[0].href).toBe("/profile");
  });

  it("uses only the available saved list and distinguishes empty alerts from an unavailable read", () => {
    const page = { ...context, pathname: "/my", signedIn: true, saved: [{ policy: monthlyRent, status: "saved" }] };
    const result = assistantReply("저장한 정책 중 마감이 가까운 건?", page);
    expect(result.policies.map(({ id }) => id)).toEqual([monthlyRent.id]);
    expect(result.evidence).toEqual([]);

    expect(assistantReply("읽지 않은 알림 알려줘", page).answer).toContain("불러올 수 없어요");
    expect(assistantReply("읽지 않은 알림 알려줘", { ...page, notifications: { unread: 0, recent: [] } }).answer).toContain("아직 받은");
    expect(assistantReply("마감 알림은 어떻게 받아요?", page).links?.[0].href).toBe("/me");
  });
});
