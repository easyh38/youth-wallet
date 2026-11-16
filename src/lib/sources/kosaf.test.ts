import { describe, expect, it } from "vitest";
import { repairUrl } from "./kosaf";

describe("repairUrl (장학재단 홈페이지 주소 수리)", () => {
  it('"?" 빠진 재단 상품 주소를 고친다', () => {
    expect(repairUrl("https://www.kosaf.go.kr/ko/tuition.dopg=tuition19&naviParam=HD01021001")).toBe(
      "https://www.kosaf.go.kr/ko/tuition.do?pg=tuition19&naviParam=HD01021001",
    );
    expect(repairUrl("https://www.yangcheon.go.kr/site/yangcheon/ex/bbs/View.docbIdx=254&bcIdx=313158&mode=")).toBe(
      "https://www.yangcheon.go.kr/site/yangcheon/ex/bbs/View.do?cbIdx=254&bcIdx=313158&mode=",
    );
  });

  it("사이트 이름을 확장자로 쓰는 주소", () => {
    expect(repairUrl("https://www.dongnae.go.kr/index.dongnaecontentsSid=2073")).toBe("https://www.dongnae.go.kr/index.dongnae?contentsSid=2073");
  });

  it("이미 올바른 주소는 그대로 둔다", () => {
    for (const u of ["https://www.kosaf.go.kr/ko/scholar.do?pg=a&b=c", "http://www.wooyang.org", "https://www.jntle.kr/main", "https://fund.pknu.ac.kr/fund/5882"]) {
      expect(repairUrl(u)).toBe(u);
    }
  });

  it("깨진 http(s) 머리를 고친다", () => {
    expect(repairUrl("http//www.jiheonsf.or.kr")).toBe("http://www.jiheonsf.or.kr");
    expect(repairUrl("https:/baekam.org")).toBe("https://baekam.org");
    expect(repairUrl("http;//graduate.ewha.ac.kr")).toBe("http://graduate.ewha.ac.kr");
    expect(repairUrl("htps://www.sangji.ac.kr")).toBe("https://www.sangji.ac.kr");
    expect(repairUrl("https:beomeun.or.kr")).toBe("https://beomeun.or.kr");
  });

  it("http가 빠진 주소, 앞에 글자가 붙은 주소", () => {
    expect(repairUrl("www.kosaf.go.kr")).toBe("http://www.kosaf.go.kr");
    expect(repairUrl("sungbossf.kr/index.php")).toBe("http://sungbossf.kr/index.php");
    expect(repairUrl("httpbin.org")).toBe("http://httpbin.org");
    expect(repairUrl("3. https://fund.pknu.ac.kr/fund/5882")).toBe("https://fund.pknu.ac.kr/fund/5882");
  });

  it("주소가 아니면 빈 문자열", () => {
    expect(repairUrl("해당없음")).toBe("");
    expect(repairUrl("")).toBe("");
    expect(repairUrl("홈페이지 참조")).toBe("");
  });
});
