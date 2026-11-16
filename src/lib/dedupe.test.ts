import { describe, expect, it } from "vitest";
import { dedupePolicies, isSamePolicy } from "./dedupe";
import type { Policy, Source } from "./types";

let n = 0;
const P = (source: Source, title: string, agency: string, regionCodes: string[], applyEnd: string | null = null, applyStart: string | null = null): Policy => ({
  id: `${source}-${++n}`,
  source,
  title,
  agency,
  category: "etc",
  regionCodes,
  ageMin: null,
  ageMax: null,
  incomeMax: null,
  studentStatus: null,
  employmentStatus: null,
  applyStart,
  applyEnd,
  isAlwaysOpen: false,
  summaryRaw: "",
  detailUrl: "",
  attachmentUrls: [],
});

describe("isSamePolicy: 합쳐야 하는 경우 (실제 데이터에서 겹친 예)", () => {
  it("띄어쓰기·문장부호만 다르고 지역·기관이 같다", () => {
    expect(isSamePolicy(P("youth", "청년문화예술패스", "문화체육관광부", ["ALL"], "2026-06-30"), P("gov24", "청년 문화예술패스", "문화체육관광부", ["ALL"], "2026-06-30"))).toBe(true);
    expect(isSamePolicy(P("youth", "신혼부부 · 다자녀가정 보금자리 지원", "전남광주통합특별시", ["46"]), P("gov24", "신혼부부·다자녀가정 보금자리 지원", "전남광주통합특별시", ["46"]))).toBe(true);
  });

  it("기관명에 부서가 붙어 있거나 '청'이 붙어 있다", () => {
    expect(isSamePolicy(P("youth", "예술창작공간 레지던시 프로그램", "대구광역시 문화체육관광국 문화예술정책과", ["27"]), P("gov24", "예술창작공간 레지던시 프로그램", "대구광역시", ["27"]))).toBe(true);
    expect(isSamePolicy(P("gov24", "대학생 학자금대출 이자 지원", "인천광역시", ["28"]), P("kosaf", "대학생 학자금대출 이자지원", "인천광역시청", ["28"], "2026-08-14"))).toBe(true);
    expect(isSamePolicy(P("gov24", "생활장학금", "울산연구원", ["31"]), P("kosaf", "생활장학금", "재단법인 울산연구원", ["31"]))).toBe(true);
  });

  it("한쪽 기관이 부서 이름뿐이면 지역으로 판단한다", () => {
    expect(isSamePolicy(P("youth", "청년인턴", "청년정책과", ["44130"]), P("gov24", "청년인턴", "충청남도 천안시", ["44130"]))).toBe(true);
  });

  it("출처가 다르면 한쪽 날짜가 비어 있어도 된다 (보조금24는 날짜를 거의 주지 않는다)", () => {
    expect(isSamePolicy(P("youth", "익산형 근로청년수당", "전북특별자치도 익산시", ["52140"], "2026-05-29"), P("gov24", "익산형 근로청년수당", "전북특별자치도 익산시", ["52140"]))).toBe(true);
  });
});

describe("isSamePolicy: 절대 합치면 안 되는 경우", () => {
  it("이름이 같아도 지역이 다르면 다른 정책 (지자체마다 따로 운영)", () => {
    expect(isSamePolicy(P("youth", "청년월세 지원", "대구광역시 청년정책과", ["27"]), P("youth", "청년월세 지원", "경기도 주택정책과", ["41"]))).toBe(false);
    expect(isSamePolicy(P("youth", "청년월세 지원", "국토교통부", ["ALL"]), P("gov24", "청년월세 지원", "국토교통부", ["27"]))).toBe(false);
  });

  it("기관이 같아도 지역이 다르면 다른 정책 (예전 방식은 전국 정책을 지웠다)", () => {
    expect(isSamePolicy(P("youth", "청년내일저축계좌", "보건복지부", ["46:장흥군"]), P("youth", "청년내일저축계좌", "보건복지부", ["ALL"]))).toBe(false);
  });

  it("이름·지역이 같아도 기관이 다르면 다른 정책", () => {
    expect(isSamePolicy(P("youth", "청년성장프로젝트", "세종특별자치시", ["ALL"]), P("gov24", "청년성장프로젝트", "고용노동부", ["ALL"]))).toBe(false);
  });

  it("마감일이 다르면 다른 해·다른 회차", () => {
    expect(isSamePolicy(P("youth", "청년문화예술패스", "문화체육관광부", ["ALL"], "2026-06-30"), P("youth", "청년문화예술패스", "문화체육관광부", ["ALL"], "2025-05-31"))).toBe(false);
    expect(isSamePolicy(P("youth", "청년농업인 농지임차료 지원", "농축산국", ["44"], "2025-08-31"), P("gov24", "청년농업인 농지 임차료 지원", "충청남도", ["44"], "2025-07-31"))).toBe(false);
  });

  it("같은 출처에서 한쪽만 날짜가 있으면 따로 등록된 회차로 본다", () => {
    expect(isSamePolicy(P("youth", "현장중심 실무인력 양성사업", "대구광역시 경제국", ["27"]), P("youth", "현장중심 실무인력 양성사업", "대구광역시 경제국", ["27"], "2026-06-30", "2026-04-01"))).toBe(false);
  });

  it("이름이 조금이라도 다르면 합치지 않는다", () => {
    expect(isSamePolicy(P("youth", "청년월세 지원", "울산광역시", ["31"]), P("youth", "청년월세 지원사업", "울산광역시", ["31"]))).toBe(false);
  });

  it("지역을 알 수 없으면 합치지 않는다", () => {
    expect(isSamePolicy(P("kosaf", "희망장학금", "○○장학회", []), P("kosaf", "희망장학금", "○○장학회", []))).toBe(false);
  });
});

describe("dedupePolicies", () => {
  it("앞 출처를 남기고, 사라진 ID는 남은 ID로 연결한다", () => {
    const y = P("youth", "청년문화예술패스", "문화체육관광부", ["ALL"]);
    const g = P("gov24", "청년 문화예술패스", "문화체육관광부", ["ALL"]);
    const other = P("gov24", "청년 문화예술패스", "문화체육관광부", ["27"]);
    const { policies, aliases } = dedupePolicies([[y], [g, other]]);
    expect(policies.map((p) => p.id)).toEqual([y.id, other.id]);
    expect(aliases.get(g.id)).toBe(y.id);
  });

  it("같은 ID가 두 번 오면 하나만 남긴다", () => {
    const a = P("youth", "A", "x", ["11"]);
    expect(dedupePolicies([[a, { ...a }]]).policies).toHaveLength(1);
  });
});
