import { describe, expect, it } from "vitest";
import { isYouthService } from "./gov24";

const svc = (서비스명: string, 지원대상: string) => ({ 서비스명, 지원대상, 서비스목적요약: "" });

describe("isYouthService (보조금24 청년 서비스 판별)", () => {
  it("청년 키워드가 있으면 체험·관람이어도 통과", () => {
    expect(isYouthService(svc("청년 행정체험단 운영", "19~29세 청년"))).toBe(true);
    expect(isYouthService(svc("청년문화예술패스 관람 지원", "만 19세 청년"))).toBe(true);
  });

  it("약한 키워드만 있는 진짜 정책은 살린다", () => {
    expect(isYouthService(svc("국가장학금 Ⅱ유형", "국내대학의 학자금지원 9구간 이하 대학생"))).toBe(true);
    expect(isYouthService(svc("신혼부부 전세자금 대출이자 지원", "관내 무주택 신혼부부"))).toBe(true);
    // "75세 이상"은 제외 조건 문장이라 나이 범위로 보지 않는다
    expect(isYouthService(svc("국민내일배움카드", "국민 누구나 ○ 지원 제외: 75세 이상 대학생 등"))).toBe(true);
  });

  it("약한 키워드만 있는 견학·공연·중장년·40세 이상은 뺀다", () => {
    expect(isYouthService(svc("발전소 시설 견학(일산)", "취업준비생 등 일반인"))).toBe(false);
    expect(isYouthService(svc("청주시립예술단 공연 대학생 할인", "청주시 거주 대학생"))).toBe(false);
    expect(isYouthService(svc("중장년 생애경력설계서비스", "40세 이상 중장년 재직자 및 구직자"))).toBe(false);
    expect(isYouthService(svc("여성구직활동 지원", "40세 이상 ~ 59세 이하 미취업 여성"))).toBe(false);
  });

  it("관련 키워드가 없으면 뺀다", () => {
    expect(isYouthService(svc("노인 일자리 지원", "65세 이상 어르신"))).toBe(false);
  });
});
