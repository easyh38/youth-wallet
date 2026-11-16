import { describe, expect, it } from "vitest";
import { matchPolicy } from "../match";
import { collapseRegionCodes, normalizeSigunguCode, REGIONS } from "../regions";
import type { UserProfile } from "../types";
import { normalizeYouth } from "./youth";

// 실제 온통청년 응답 형태 (2026-11, 일부 필드 생략)
const raw = {
  plcyNo: "20261113005400214853",
  plcyNm: "2026년 전남청년미래센터 가족돌봄청(소)년 자기돌봄비 지원",
  plcyKywdNm: "보조금",
  plcyExplnCn: "가족돌봄청(소)년에게 경제적 지원을 제공합니다.",
  lclsfNm: "금융･복지･문화",
  mclsfNm: "취약계층 및 금융지원",
  plcySprtCn: "1회 200만원 우리카드 선포인트 지급\n지급일로부터 1년간 사용가능",
  sprvsnInstCdNm: "전남광주통합특별시",
  operInstCdNm: "전남광주통합특별시",
  aplyPrdSeCd: "0057002",
  bizPrdBgngYmd: "        ",
  bizPrdEndYmd: "        ",
  bizPrdEtcCn: "연중",
  plcyAplyMthdCn: "온라인 신청> 참여요건 확인> 대상자 선정 안내",
  srngMthdCn: "개별 연락처로 유선 또는 문자 안내 예정",
  aplyUrlAddr: "",
  sbmsnDcmntCn: "",
  refUrlAddr1: "https://youth.jeonnam-gwangju.go.kr/www/50",
  sprtSclCnt: "0",
  sprtTrgtMinAge: "13",
  sprtTrgtMaxAge: "35",
  sprtTrgtAgeLmtYn: "Y",
  mrgSttsCd: "0055003",
  earnCndSeCd: "0043001",
  earnMinAmt: "0",
  earnMaxAmt: "0",
  zipCd: "12110,12130,12150,12170,12190,12710,12720",
  plcyMajorCd: "0011009",
  jobCd: "0013010",
  schoolCd: "0049010",
  aplyYmd: "",
  sbizCd: "0014010",
};

const profile: UserProfile = {
  regionCode: "46110", // 전남 목포시
  birthYear: 2000,
  incomeLevel: null,
  studentStatus: "재학",
  employmentStatus: "미취업",
  interests: [],
};

describe("normalizeYouth", () => {
  it("코드값을 매칭용 값으로 바꾼다", () => {
    const p = normalizeYouth(raw);
    expect(p.id).toBe("youth-20261113005400214853");
    expect(p.ageMin).toBe(13);
    expect(p.ageMax).toBe(35);
    expect(p.isAlwaysOpen).toBe(true);
    expect(p.studentStatus).toBeNull(); // 0049010 제한없음
    expect(p.employmentStatus).toBeNull(); // 0013010 제한없음
    expect(p.category).toBe("welfare");
    expect(p.unknownFields).toEqual([]);
    expect(p.keywords).toEqual(["보조금"]);
    expect(p.amountMax).toBeNull();
  });

  it("전남광주 12xxx 코드를 옛 전남 코드로 바꾼다", () => {
    const p = normalizeYouth(raw);
    // 전남 표의 다섯 시(목포·여수·순천·나주·광양)를 모두 덮으므로 시·도 코드로 줄어든다
    expect(p.regionCodes).toContain("46");
    expect(p.regionCodes).not.toContain("29");
    expect(matchPolicy(profile, p, "2026-11-16").status).toBe("eligible");
    expect(matchPolicy({ ...profile, regionCode: "29110" }, p, "2026-11-16").status).toBe("excluded");
  });

  it("항목별 상세를 만든다", () => {
    const p = normalizeYouth(raw);
    const labels = p.details!.map((d) => d.label);
    expect(labels).toEqual(expect.arrayContaining(["정책 소개", "지원 내용", "지원 연령", "신청 기간", "사업 기간", "신청 방법", "심사 방법"]));
    expect(p.details!.find((d) => d.label === "지원 연령")!.value).toBe("만 13~35세");
    expect(p.summaryRaw).toMatch(/^지원대상: 만 13~35세$/m);
    expect(p.detailUrl).toContain("youthcenter.go.kr");
    expect(p.links!.map((l) => l.label)).toEqual(["온통청년 상세", "참고 사이트"]);
  });

  it("학력·취업 코드가 있으면 조건으로 쓴다", () => {
    const p = normalizeYouth({ ...raw, schoolCd: "0049005,0049006", jobCd: "0013003" });
    expect(p.studentStatus).toEqual(["재학", "졸업예정"]);
    expect(p.employmentStatus).toEqual(["미취업"]);
    expect(matchPolicy(profile, p, "2026-11-16").status).toBe("eligible");
    expect(matchPolicy({ ...profile, employmentStatus: "재직" }, p, "2026-11-16").status).toBe("check");
  });

  it("매칭할 수 없는 코드만 있으면 확인 필요", () => {
    const p = normalizeYouth({ ...raw, jobCd: "0013008" }); // 영농종사자
    expect(p.unknownFields).toContain("employment");
  });

  it("연소득 조건과 혼인 조건은 확인 필요로 둔다", () => {
    const p = normalizeYouth({ ...raw, earnCndSeCd: "0043002", earnMaxAmt: "5000", mrgSttsCd: "0055001" });
    expect(p.unknownFields).toContain("income");
    expect(p.details!.find((d) => d.label === "소득 조건")!.value).toBe("연소득 5,000만 원 이하");
    const m = matchPolicy(profile, p, "2026-11-16");
    expect(m.status).toBe("check");
    expect(m.reasons.join()).toMatch(/혼인 여부/);
  });

  it("특정기간 모집은 신청 기간을 읽고, 끝이 시작보다 앞서면 마감일을 모르는 것으로 둔다", () => {
    const p = normalizeYouth({ ...raw, aplyPrdSeCd: "0057001", aplyYmd: "20261102 ~ 20261211" });
    expect(p.applyStart).toBe("2026-11-02");
    expect(p.applyEnd).toBe("2026-12-11");
    const bad = normalizeYouth({ ...raw, aplyPrdSeCd: "0057001", aplyYmd: "20260309 ~ 20250316" });
    expect(bad.applyEnd).toBeNull();
    expect(bad.unknownFields).toContain("period");
  });
});

describe("지역 코드", () => {
  it("일반구·12xxx·옛 강원 코드를 지역 표 기준으로 맞춘다", () => {
    expect(normalizeSigunguCode("41111")).toBe("41110"); // 수원 장안구 → 수원시
    expect(normalizeSigunguCode("48121")).toBe("48120"); // 창원 의창구 → 창원시
    expect(normalizeSigunguCode("12330")).toBe("29200"); // 광주 광산구
    expect(normalizeSigunguCode("12850")).toBe("46:완도군");
    expect(normalizeSigunguCode("42110")).toBe("51110");
    expect(normalizeSigunguCode("30000")).toBe("30"); // 대전 전체
  });

  it("인천 개편: 새 구 코드가 한두 개 빠진 전국 목록도 전국으로 본다", () => {
    const every = REGIONS.flatMap((r) => r.sigungu.map((g) => g.code)).filter((c) => c !== "28155" && c !== "28275");
    expect(collapseRegionCodes(every)).toEqual(["ALL"]);
    // 인천만 대상인 공고에서 빠진 구는 그대로 빠진 것으로 본다
    const incheon = REGIONS.find((r) => r.code === "28")!.sigungu.map((g) => g.code).filter((c) => c !== "28155");
    expect(collapseRegionCodes(incheon)).not.toContain("28");
  });

  it("옛 인천 중구로 저장된 프로필도 제물포구·영종구 공고와 맞는다", () => {
    const p = normalizeYouth({ ...raw, zipCd: "28155" });
    expect(matchPolicy({ ...profile, regionCode: "28110" }, p, "2026-11-16").status).toBe("eligible");
    expect(matchPolicy({ ...profile, regionCode: "28140" }, p, "2026-11-16").status).toBe("excluded");
  });

  it("모든 시·도를 덮으면 전국", () => {
    const every = REGIONS.flatMap((r) => r.sigungu.map((g) => g.code));
    expect(collapseRegionCodes(every)).toEqual(["ALL"]);
    expect(collapseRegionCodes(["11110", "11140"])).toEqual(["11110", "11140"]);
  });
});
