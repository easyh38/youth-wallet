import { describe, expect, it } from "vitest";
import { searchPolicies } from "./search";

const item = (title: string, summaryRaw = "", agency = "기관") => ({ policy: { title, agency, summaryRaw } });
const titles = (list: { policy: { title: string } }[]) => list.map((x) => x.policy.title);

describe("searchPolicies", () => {
  const list = [
    item("청년 월세 지원", "지원내용: 월 20만원"),
    item("취업 후 상환 학자금대출", "지원대상: 대학생"),
    item("국가장학금", "지원내용: 등록금 지원. 학자금 대출과 중복 가능"),
    item("일반 상환 학자금대출"),
  ];

  it("띄어쓰기와 상관없이 찾는다", () => {
    expect(titles(searchPolicies(list, "학자금 대출"))).toEqual(["취업 후 상환 학자금대출", "일반 상환 학자금대출", "국가장학금"]);
    expect(titles(searchPolicies(list, "학자금대출"))).toEqual(["취업 후 상환 학자금대출", "일반 상환 학자금대출", "국가장학금"]);
  });

  it("정책명에 맞는 것을 설명에만 나오는 것보다 앞에", () => {
    expect(titles(searchPolicies(list, "대출"))[2]).toBe("국가장학금");
  });

  it("모든 단어가 들어 있어야 한다", () => {
    expect(titles(searchPolicies(list, "월세 학자금"))).toEqual([]);
  });

  it("기관명으로도 찾는다", () => {
    expect(titles(searchPolicies([item("A"), item("B", "", "한국장학재단")], "장학재단"))).toEqual(["B"]);
  });

  it("빈 검색어는 그대로", () => {
    expect(searchPolicies(list, "  ")).toBe(list);
  });
});
