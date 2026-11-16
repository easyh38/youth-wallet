import iconv from "iconv-lite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchKosaf, repairUrl } from "./kosaf";

describe("장학재단 공개 원본 파일", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("CP949와 여러 줄로 된 공고를 기존 정책 형식으로 읽는다", async () => {
    vi.stubEnv("KOSAF_API_KEY", undefined);
    vi.stubEnv("KOSAF_PUBLIC_FILE_URL", "https://www.data.go.kr/cmm/cmm/fileDownload.do?fileDetailSn=1");
    const csv = "번호,운영기관명,상품명,지원내역 상세내용,모집종료일\r\n"
      + '314,한국장학재단,근로장학금,"교내, 교외 장학금\r\n근로 시간에 따라 지급",2027-02-28';
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from(iconv.encode(csv, "cp949")))));

    const [policy] = await fetchKosaf();
    expect(policy).toMatchObject({ id: "kosaf-314", source: "kosaf", title: "근로장학금", applyEnd: "2027-02-28" });
    expect(policy.summaryRaw).toContain("교내, 교외 장학금");
    expect(policy.summaryRaw).toContain("근로 시간에 따라 지급");
  });
});

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
