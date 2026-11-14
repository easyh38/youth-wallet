import { describe, expect, it } from "vitest";
import { matchPolicy } from "../match";
import { regionName } from "../regions";
import type { Policy, UserProfile } from "../types";
import { normalizeGov24 } from "./gov24";
import { regionsFromAgency, regionsFromText } from "./parse";

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

  it("출자·출연기관, 지방공기업은 확인 필요", () => {
    expect(regionsFromAgency("강북구도시관리공단", "지방공기업")).toEqual([]);
    expect(regionsFromAgency("서울문화재단", "지방출자_출연기관")).toEqual([]);
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
