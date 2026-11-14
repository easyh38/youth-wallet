import { describe, expect, it } from "vitest";
import { matchAll, matchPolicy, sortMatched } from "./match";
import type { Policy, UserProfile } from "./types";

const TODAY = "2026-11-12";

const profile: UserProfile = {
  regionCode: "11680", // 서울 강남구
  birthYear: 2003, // 만 22~23세
  incomeLevel: 4,
  studentStatus: "재학",
  employmentStatus: "미취업",
  interests: ["주거"],
};

const base: Policy = {
  id: "youth-1",
  source: "youth",
  title: "테스트 정책",
  agency: "테스트 기관",
  category: "housing",
  regionCodes: ["ALL"],
  ageMin: 19,
  ageMax: 34,
  incomeMax: null,
  studentStatus: null,
  employmentStatus: null,
  applyStart: "2026-11-01",
  applyEnd: "2026-12-31",
  isAlwaysOpen: false,
  summaryRaw: "",
  detailUrl: "https://example.com",
  attachmentUrls: [],
};
const p = (over: Partial<Policy>): Policy => ({ ...base, ...over });

describe("matchPolicy", () => {
  it("모든 조건이 맞으면 신청 가능", () => {
    expect(matchPolicy(profile, base, TODAY).status).toBe("eligible");
  });

  describe("지역", () => {
    it("시·군·구 코드가 같으면 일치", () => {
      expect(matchPolicy(profile, p({ regionCodes: ["11680"] }), TODAY).status).toBe("eligible");
    });
    it("상위 시·도 코드가 같으면 일치", () => {
      expect(matchPolicy(profile, p({ regionCodes: ["11"] }), TODAY).status).toBe("eligible");
    });
    it("다른 지역이면 제외", () => {
      expect(matchPolicy(profile, p({ regionCodes: ["26350", "41"] }), TODAY).status).toBe("excluded");
    });
    it("같은 시·도의 다른 구는 제외", () => {
      expect(matchPolicy(profile, p({ regionCodes: ["11440"] }), TODAY).status).toBe("excluded");
    });
    it("옛 강원 코드(42)도 새 코드(51)와 같게 본다", () => {
      const gw = { ...profile, regionCode: "51110" };
      expect(matchPolicy(gw, p({ regionCodes: ["42110"] }), TODAY).status).toBe("eligible");
    });
    it("지역 정보가 비어 있으면 확인 필요", () => {
      expect(matchPolicy(profile, p({ regionCodes: [] }), TODAY).status).toBe("check");
    });
  });

  describe("나이", () => {
    it("범위를 확실히 벗어나면 제외", () => {
      expect(matchPolicy(profile, p({ ageMin: 25, ageMax: 39 }), TODAY).status).toBe("excluded");
    });
    it("생일에 따라 달라지는 경계 나이는 확인 필요", () => {
      // 2003년생은 2026년에 만 22 또는 23세
      expect(matchPolicy(profile, p({ ageMin: 23, ageMax: 34 }), TODAY).status).toBe("check");
    });
    it("나이 조건이 없으면 통과", () => {
      expect(matchPolicy(profile, p({ ageMin: null, ageMax: null }), TODAY).status).toBe("eligible");
    });
    it("문장으로만 적힌 나이 조건은 확인 필요", () => {
      expect(matchPolicy(profile, p({ ageMin: null, ageMax: null, unknownFields: ["age"] }), TODAY).status).toBe("check");
    });
  });

  describe("신청 기간", () => {
    it("마감일이 지나면 제외", () => {
      expect(matchPolicy(profile, p({ applyEnd: "2026-11-11" }), TODAY).status).toBe("excluded");
    });
    it("오늘 마감이면 신청 가능", () => {
      expect(matchPolicy(profile, p({ applyEnd: TODAY }), TODAY).status).toBe("eligible");
    });
    it("상시 모집이면 신청 가능", () => {
      expect(matchPolicy(profile, p({ applyEnd: null, isAlwaysOpen: true }), TODAY).status).toBe("eligible");
    });
    it("마감일을 모르면 확인 필요", () => {
      expect(matchPolicy(profile, p({ applyEnd: null }), TODAY).status).toBe("check");
    });
  });

  describe("소득·학적·취업", () => {
    it("소득분위를 모름으로 고르면 확인 필요", () => {
      const r = matchPolicy({ ...profile, incomeLevel: null }, p({ incomeMax: 8 }), TODAY);
      expect(r.status).toBe("check");
      expect(r.reasons.join()).toContain("모름");
    });
    it("소득분위가 기준 이하이면 신청 가능", () => {
      expect(matchPolicy(profile, p({ incomeMax: 8 }), TODAY).status).toBe("eligible");
    });
    it("소득분위가 기준을 넘으면 확인 필요 (기관마다 기준이 달라 제외하지 않음)", () => {
      expect(matchPolicy(profile, p({ incomeMax: 3 }), TODAY).status).toBe("check");
    });
    it("학적 조건이 맞지 않으면 확인 필요", () => {
      expect(matchPolicy(profile, p({ studentStatus: ["졸업"] }), TODAY).status).toBe("check");
    });
    it("취업 상태가 맞으면 신청 가능", () => {
      expect(matchPolicy(profile, p({ employmentStatus: ["미취업", "창업 준비"] }), TODAY).status).toBe("eligible");
    });
  });
});

describe("정렬", () => {
  it("신청 가능 → 확인 필요, 마감 임박순, 상시 모집은 맨 뒤", () => {
    const list = [
      p({ id: "a", isAlwaysOpen: true, applyEnd: null }),
      p({ id: "b", applyEnd: "2026-12-01" }),
      p({ id: "c", applyEnd: "2026-11-20" }),
      p({ id: "d", applyEnd: "2026-11-15", incomeMax: 1 }), // 확인 필요
    ];
    const { results, counts } = matchAll(profile, list, TODAY);
    expect(results.map((r) => r.policy.id)).toEqual(["c", "b", "a", "d"]);
    expect(counts).toEqual({ eligible: 3, check: 1, excluded: 0 });
  });

  it("제외된 정책은 목록에 나오지 않는다", () => {
    const { results, counts } = matchAll(profile, [base, p({ id: "x", regionCodes: ["26"] })], TODAY);
    expect(results).toHaveLength(1);
    expect(counts.excluded).toBe(1);
  });

  it("sortMatched는 원본 배열을 바꾸지 않는다", () => {
    const arr = [
      { policy: p({ id: "1", applyEnd: "2026-12-31" }), status: "eligible" as const, reasons: [] },
      { policy: p({ id: "2", applyEnd: "2026-11-30" }), status: "eligible" as const, reasons: [] },
    ];
    sortMatched(arr);
    expect(arr[0].policy.id).toBe("1");
  });
});
