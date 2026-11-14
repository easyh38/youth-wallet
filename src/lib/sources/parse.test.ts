import { describe, expect, it } from "vitest";
import { matchPolicy } from "../match";
import { regionName } from "../regions";
import type { Policy, UserProfile } from "../types";
import { normalizeGov24 } from "./gov24";
import { regionsFromAgency, regionsFromName, regionsFromRegionText, regionsFromText } from "./parse";

describe("regionsFromAgency (보조금24 소관기관)", () => {
  it("시군구 기관은 해당 시·군·구 코드", () => {
    expect(regionsFromAgency("서울특별시 강서구", "시군구")).toEqual(["11500"]);
    expect(regionsFromAgency("경기도 수원시", "시군구")).toEqual(["41110"]);
  });

  it("같은 이름의 구는 시·도로 구분한다", () => {
    expect(regionsFromAgency("부산광역시 강서구", "시군구")).toEqual(["26440"]);
    expect(regionsFromAgency("경기도 광주시", "시군구")).toEqual(["41610"]);
  });

  it("지역 표에 없는 시·군·구는 이름 코드로 둔다", () => {
    expect(regionsFromAgency("충청남도 부여군", "시군구")).toEqual(["44:부여군"]);
    expect(regionName("44:부여군")).toBe("충청남도 부여군");
  });

  it("전남광주통합특별시는 옛 광주·전남 양쪽에서 찾는다", () => {
    expect(regionsFromAgency("전남광주통합특별시 광산구", "시군구")).toEqual(["29200"]);
    expect(regionsFromAgency("전남광주통합특별시 목포시", "시군구")).toEqual(["46110"]);
    expect(regionsFromAgency("전남광주통합특별시", "광역시도").sort()).toEqual(["29", "46"]);
  });

  it("광역시도·교육청은 시·도 코드", () => {
    expect(regionsFromAgency("서울특별시", "광역시도")).toEqual(["11"]);
    expect(regionsFromAgency("경기도교육청", "교육청")).toEqual(["41"]);
  });

  it("출자·출연기관, 지방공기업은 기관 이름 앞의 지역명으로", () => {
    expect(regionsFromAgency("강북구도시관리공단", "지방공기업")).toEqual(["11305"]);
    expect(regionsFromAgency("서울문화재단", "지방출자_출연기관")).toEqual(["11"]);
    expect(regionsFromAgency("(재)대전일자리경제진흥원", "지방출자_출연기관")).toEqual(["30"]);
    expect(regionsFromAgency("경북신용보증재단", "지방출자_출연기관")).toEqual(["47"]);
    expect(regionsFromAgency("재단법인충북인재평생교육진흥원", "지방출자_출연기관")).toEqual(["43"]);
    expect(regionsFromAgency("(재)대구동구교육재단", "지방출자_출연기관")).toEqual(["27140"]);
    expect(regionsFromAgency("재단법인목포인재육성재단", "지방출자_출연기관")).toEqual(["46110"]);
    expect(regionsFromAgency("재단법인거창군장학회", "지방출자_출연기관")).toEqual(["48:거창군"]);
  });

  it("이름에 지역이 없는 기관은 확인 필요", () => {
    expect(regionsFromAgency("한마음복지재단", "지방출자_출연기관")).toEqual([]);
  });

  it("중앙행정기관·공공기관은 전국", () => {
    expect(regionsFromAgency("고용노동부", "중앙행정기관")).toEqual(["ALL"]);
    expect(regionsFromAgency("한국장학재단", "공공기관")).toEqual(["ALL"]);
  });
});

describe("regionsFromText", () => {
  it("전남광주통합특별시 표기를 인식한다", () => {
    expect(regionsFromText("전남광주통합특별시 거주자")?.sort()).toEqual(["29", "46"]);
  });
});

describe("regionsFromName", () => {
  it("지역 표에 없는 시·군은 이름 코드로", () => {
    expect(regionsFromName("횡성인재육성장학회")).toEqual(["51:횡성군"]);
    expect(regionsFromName("(재)음성군장학회")).toEqual(["43:음성군"]);
  });

  it("시·도 + 시·군 표기", () => {
    expect(regionsFromName("강원도 원주시청")).toEqual(["51130"]);
    expect(regionsFromName("경상남도 고성군청")).toEqual(["48:고성군"]);
    expect(regionsFromName("경상남도장학회")).toEqual(["48"]);
  });

  it("두 곳에 같은 이름이 있으면 둘 다", () => {
    expect(regionsFromName("고성군장학회").sort()).toEqual(["48:고성군", "51:고성군"]);
    expect(regionsFromName("광주시청").sort()).toEqual(["29", "41610"]);
  });
});

describe("regionsFromRegionText (장학금 지역 기준)", () => {
  it("문구의 시·군 이름", () => {
    expect(regionsFromRegionText("○ 군포시에 1년 이상 주민등록", "군포시청")).toEqual(["41410"]);
    expect(regionsFromRegionText("○ 보호자가 6개월 이상 고성군 관내에 주민등록", "경상남도 고성군청")).toEqual(["48:고성군"]);
  });

  it("'관내'처럼 지역명이 없으면 운영기관 지역", () => {
    expect(regionsFromRegionText("○ 신청일 현재 관내에 주소를 두고 1년 이상 거주", "(재)인제군장학회")).toEqual(["51:인제군"]);
    expect(regionsFromRegionText("○ 도내 대학 소속 학부생", "경상남도장학회")).toEqual(["48"]);
  });

  it("다른 이름 속에 든 구 이름은 무시", () => {
    expect(regionsFromRegionText("서울특별시 강남구 거주", "")).toEqual(["11680"]);
  });

  it("전국이면 ALL, 아무 단서도 없으면 확인 필요", () => {
    expect(regionsFromRegionText("전국 대학생", "OO장학회")).toEqual(["ALL"]);
    expect(regionsFromRegionText("부모가 거주하는 자", "한마음장학회")).toEqual([]);
  });
});

describe("하남시 사용자 지역 매칭 (회귀)", () => {
  const hanam: UserProfile = {
    regionCode: "41450", birthYear: 2003, incomeLevel: null,
    studentStatus: "재학", employmentStatus: "미취업", interests: [],
  };
  const raw = (agency: string, type: string) => ({
    서비스ID: "X", 서비스명: "청년 지원", 소관기관명: agency, 소관기관유형: type,
    지원대상: "만 19세~39세 청년", 신청기한: "상시신청", 지원내용: "월 20만원",
  });
  const status = (p: Policy) => matchPolicy(hanam, p, "2026-11-14").status;

  it("다른 지역 재단·공기업 공고는 제외", () => {
    expect(status(normalizeGov24(raw("(재)대전일자리경제진흥원", "지방출자_출연기관")))).toBe("excluded");
    expect(status(normalizeGov24(raw("재단법인목포인재육성재단", "지방출자_출연기관")))).toBe("excluded");
    expect(status(normalizeGov24(raw("인천광역시 영종구", "시군구")))).toBe("excluded");
  });

  it("경기도·하남시 공고는 포함", () => {
    expect(status(normalizeGov24(raw("경기도일자리재단", "지방출자_출연기관")))).not.toBe("excluded");
    expect(status(normalizeGov24(raw("하남시도시공사", "지방공기업")))).not.toBe("excluded");
  });
});

describe("보조금24 지역 매칭 (회귀)", () => {
  const gangnam: UserProfile = {
    regionCode: "11680", birthYear: 2003, incomeLevel: null,
    studentStatus: "재학", employmentStatus: "미취업", interests: [],
  };
  const raw = (agency: string, type: string) => ({
    서비스ID: "X", 서비스명: "청년 월세 지원", 소관기관명: agency, 소관기관유형: type,
    지원대상: "만 19세~39세 청년", 신청기한: "상시신청", 지원내용: "월 20만원",
  });
  const status = (p: Policy) => matchPolicy(gangnam, p, "2026-11-14").status;

  it("다른 구 정책은 제외", () => {
    expect(status(normalizeGov24(raw("서울특별시 강서구", "시군구")))).toBe("excluded");
    expect(status(normalizeGov24(raw("충청남도 부여군", "시군구")))).toBe("excluded");
  });

  it("내 구 정책과 서울시 정책은 포함", () => {
    expect(status(normalizeGov24(raw("서울특별시 강남구", "시군구")))).not.toBe("excluded");
    expect(status(normalizeGov24(raw("서울특별시", "광역시도")))).not.toBe("excluded");
  });
});
