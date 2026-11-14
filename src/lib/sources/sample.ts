// API 키가 없을 때 쓰는 샘플 정책. 실제 정책을 본떠 만든 연습용 데이터이며 내용은 실제 공고와 다를 수 있다.
// 마감일은 오늘 기준 상대 날짜로 만들어 언제 실행해도 D-day가 살아 있게 한다.

import { addDays, kstDate } from "../date";
import type { Policy, Source } from "../types";

type Seed = Omit<Policy, "applyStart" | "applyEnd" | "id" | "source" | "attachmentUrls"> & {
  key: string;
  start: number | null; // 오늘 기준 며칠 뒤 (음수면 과거)
  end: number | null;
};

const YOUTH: Seed[] = [
  {
    key: "R2026001", title: "청년월세 특별지원", agency: "국토교통부", category: "housing",
    regionCodes: ["ALL"], ageMin: 19, ageMax: 34, incomeMax: null, studentStatus: null, employmentStatus: null,
    start: -20, end: 3, isAlwaysOpen: false, amountMax: 2_400_000, unknownFields: ["income"],
    summaryRaw: `지원대상: 부모와 따로 거주하는 만 19세~34세 무주택 청년 (청년가구 기준 중위소득 60% 이하, 원가구 중위소득 100% 이하)
지원내용: 실제 납부하는 임대료를 월 최대 20만원, 최대 12개월 지원 (총 최대 240만원)
신청기간: 공고일부터 마감일까지 (예산 소진 시 조기 마감)
신청방법: 복지로 누리집 온라인 신청 또는 주민등록 주소지 행정복지센터 방문 신청
제출서류: 임대차계약서 사본, 월세 이체 증빙서류, 가족관계증명서`,
    detailUrl: "https://www.youthcenter.go.kr",
  },
  {
    key: "R2026002", title: "서울시 청년 월세지원", agency: "서울특별시", category: "housing",
    regionCodes: ["11"], ageMin: 19, ageMax: 39, incomeMax: null, studentStatus: null, employmentStatus: null,
    start: -10, end: 9, isAlwaysOpen: false, amountMax: 2_400_000, unknownFields: ["income"],
    summaryRaw: `지원대상: 서울시에 거주하는 만 19세~39세 무주택 청년 1인 가구 (기준 중위소득 150% 이하)
지원내용: 월 최대 20만원, 최대 12개월 임차료 지원
신청방법: 서울주거포털 온라인 신청
제출서류: 임대차계약서, 주민등록등본, 월세 이체 내역`,
    detailUrl: "https://housing.seoul.go.kr",
  },
  {
    key: "R2026003", title: "국민취업지원제도 (1유형)", agency: "고용노동부", category: "job",
    regionCodes: ["ALL"], ageMin: 15, ageMax: 34, incomeMax: null, studentStatus: null, employmentStatus: ["미취업"],
    start: null, end: null, isAlwaysOpen: true, amountMax: 3_000_000, unknownFields: ["income"],
    summaryRaw: `지원대상: 만 15세~34세 미취업 청년 (가구 중위소득 120% 이하, 재산 5억 이하)
지원내용: 취업활동계획 수립 및 구직촉진수당 월 50만원 6개월 (최대 300만원) + 취업성공수당
신청기간: 연중 상시
신청방법: 고용24 온라인 신청 또는 고용센터 방문
제출서류: 신분증, 구직신청서, 개인정보 수집 동의서`,
    detailUrl: "https://www.work24.go.kr",
  },
  {
    key: "R2026004", title: "청년도약계좌", agency: "금융위원회", category: "welfare",
    regionCodes: ["ALL"], ageMin: 19, ageMax: 34, incomeMax: null, studentStatus: null, employmentStatus: null,
    start: -5, end: 14, isAlwaysOpen: false, amountMax: null, unknownFields: ["income"],
    summaryRaw: `지원대상: 만 19세~34세 청년 중 개인소득 7,500만원 이하, 가구소득 중위 250% 이하
지원내용: 5년 만기 적금, 월 최대 70만원 납입 시 정부기여금과 비과세 혜택
신청기간: 매월 가입 신청 기간 운영
신청방법: 취급 은행 앱에서 가입 신청
제출서류: 별도 서류 없음 (소득 확인 동의)`,
    detailUrl: "https://ylaccount.kinfa.or.kr",
  },
  {
    key: "R2026005", title: "경기도 청년 면접수당", agency: "경기도", category: "job",
    regionCodes: ["41"], ageMin: 18, ageMax: 39, incomeMax: null, studentStatus: null, employmentStatus: ["미취업"],
    start: -30, end: 25, isAlwaysOpen: false, amountMax: 300_000,
    summaryRaw: `지원대상: 경기도에 거주하는 만 18세~39세 미취업 청년
지원내용: 면접 1회당 5만원, 최대 6회 (최대 30만원) 지역화폐 지급
신청방법: 경기청년포털 온라인 신청
제출서류: 면접 참여 확인서, 주민등록초본`,
    detailUrl: "https://youth.gg.go.kr",
  },
  {
    key: "R2026006", title: "청년창업사관학교", agency: "중소벤처기업부", category: "startup",
    regionCodes: ["ALL"], ageMin: null, ageMax: 39, incomeMax: null, studentStatus: null, employmentStatus: ["창업 준비", "자영업"],
    start: -3, end: 40, isAlwaysOpen: false, amountMax: 100_000_000,
    summaryRaw: `지원대상: 만 39세 이하 예비창업자 및 창업 3년 이내 기업 대표
지원내용: 사업화 자금 최대 1억원, 창업 공간 및 교육·코칭 제공
신청방법: K-Startup 누리집 온라인 접수
제출서류: 사업계획서, 대표자 신분증 사본, 사업자등록증(해당자)`,
    detailUrl: "https://www.k-startup.go.kr",
  },
  {
    key: "R2026007", title: "부산 청년 디딤돌카드", agency: "부산광역시", category: "welfare",
    regionCodes: ["26"], ageMin: 18, ageMax: 34, incomeMax: null, studentStatus: null, employmentStatus: ["미취업"],
    start: -15, end: 6, isAlwaysOpen: false, amountMax: 3_000_000,
    summaryRaw: `지원대상: 부산 거주 만 18세~34세 미취업 청년
지원내용: 월 50만원, 최대 6개월 구직활동비 체크카드 지급
신청방법: 부산청년플랫폼 온라인 신청
제출서류: 주민등록등본, 고용보험 미가입 확인서`,
    detailUrl: "https://young.busan.go.kr",
  },
  {
    key: "R2026008", title: "청년 마음건강 바우처", agency: "보건복지부", category: "welfare",
    regionCodes: ["ALL"], ageMin: 19, ageMax: 34, incomeMax: null, studentStatus: null, employmentStatus: null,
    start: -40, end: -2, isAlwaysOpen: false, amountMax: null,
    summaryRaw: `지원대상: 만 19세~34세 청년 중 심리상담이 필요한 자
지원내용: 전문 심리상담 서비스 10회 제공 (본인부담금 소득에 따라 차등)
신청방법: 주소지 행정복지센터 방문 신청`,
    detailUrl: "https://www.bokjiro.go.kr",
  },
];

const GOV24: Seed[] = [
  {
    key: "SVC-0001", title: "청년 버팀목 전세자금 대출", agency: "국토교통부", category: "housing",
    regionCodes: ["ALL"], ageMin: 19, ageMax: 34, incomeMax: null, studentStatus: null, employmentStatus: null,
    start: null, end: null, isAlwaysOpen: true, amountMax: 200_000_000, unknownFields: ["income"],
    summaryRaw: `지원대상: 만 19세~34세 무주택 세대주 (연소득 5천만원 이하, 순자산 3.45억원 이하)
지원내용: 임차보증금의 80% 이내, 최대 2억원 저금리 대출
신청기간: 상시
신청방법: 주택도시기금 수탁은행 방문 또는 온라인 신청
제출서류: 주민등록등본, 확정일자부 임대차계약서, 소득 증빙서류, 재직증명서`,
    detailUrl: "https://www.gov.kr",
  },
  {
    key: "SVC-0002", title: "K-패스 청년 교통비 환급", agency: "국토교통부", category: "welfare",
    regionCodes: ["ALL"], ageMin: 19, ageMax: 34, incomeMax: null, studentStatus: null, employmentStatus: null,
    start: null, end: null, isAlwaysOpen: true, amountMax: null,
    summaryRaw: `지원대상: 만 19세~34세 청년 (월 15회 이상 대중교통 이용자)
지원내용: 대중교통 이용요금의 30% 환급
신청방법: K-패스 카드 발급 후 누리집 회원가입`,
    detailUrl: "https://korea-pass.kr",
  },
  {
    key: "SVC-0003", title: "청년 내일배움카드", agency: "고용노동부", category: "job",
    regionCodes: ["ALL"], ageMin: null, ageMax: null, incomeMax: null, studentStatus: null, employmentStatus: null,
    start: -7, end: 18, isAlwaysOpen: false, amountMax: 5_000_000, unknownFields: ["student"],
    summaryRaw: `지원대상: 국민 누구나 (단, 졸업까지 남은 기간이 2년 이내인 대학 재학생 등 일부 제외)
지원내용: 직업훈련비 최대 500만원 (5년간) 지원
신청방법: 고용24 온라인 신청
제출서류: 신분증`,
    detailUrl: "https://www.work24.go.kr",
  },
];

const KOSAF: Seed[] = [
  {
    key: "2026-N01", title: "국가장학금 Ⅰ유형 (2차)", agency: "한국장학재단", category: "scholarship",
    regionCodes: ["ALL"], ageMin: null, ageMax: null, incomeMax: 9, studentStatus: ["재학", "휴학"], employmentStatus: null,
    start: -12, end: 2, isAlwaysOpen: false, amountMax: 5_700_000,
    summaryRaw: `지원대상: 대한민국 국적의 국내 대학 재학생 중 학자금 지원구간 9구간 이하
지원내용: 학자금 지원구간에 따라 연간 최대 570만원 차등 지원
신청방법: 한국장학재단 누리집 또는 앱 신청
제출서류: 가구원 정보제공 동의, 성적증명서(필요 시)
선발기준: 직전학기 12학점 이상 이수, 백분위 80점 이상`,
    detailUrl: "https://www.kosaf.go.kr",
  },
  {
    key: "2026-N02", title: "인문100년 장학금", agency: "한국장학재단", category: "scholarship",
    regionCodes: ["ALL"], ageMin: null, ageMax: null, incomeMax: 8, studentStatus: ["재학"], employmentStatus: null,
    start: -1, end: 21, isAlwaysOpen: false, amountMax: null,
    summaryRaw: `지원대상: 인문·사회계열 대학 재학생 중 학자금 지원구간 8구간 이하
지원내용: 등록금 전액 및 생활비 학기당 250만원 지원
신청방법: 한국장학재단 누리집 신청 후 대학 추천
제출서류: 학업계획서, 성적증명서, 대학 추천서`,
    detailUrl: "https://www.kosaf.go.kr",
  },
  {
    key: "2026-N03", title: "푸른등대 기부장학금", agency: "한국장학재단", category: "scholarship",
    regionCodes: [], ageMin: null, ageMax: null, incomeMax: null, studentStatus: ["재학"], employmentStatus: null,
    start: -4, end: 11, isAlwaysOpen: false, amountMax: null, unknownFields: ["region", "income"],
    summaryRaw: `지원대상: 기부자가 정한 지역·전공의 대학 재학생 (세부 기준은 공고문 참조)
지원내용: 기부 프로그램별 장학금 차등 지급
신청방법: 한국장학재단 누리집 신청`,
    detailUrl: "https://www.kosaf.go.kr",
  },
];

function build(source: Source, seeds: Seed[], today: string): Policy[] {
  return seeds.map(({ key, start, end, ...rest }) => ({
    ...rest,
    id: `${source}-${key}`,
    source,
    applyStart: start == null ? null : addDays(today, start),
    applyEnd: end == null ? null : addDays(today, end),
    attachmentUrls: [],
  }));
}

export function samplePolicies(source: Source, today: string = kstDate()): Policy[] {
  if (source === "youth") return build("youth", YOUTH, today);
  if (source === "gov24") return build("gov24", GOV24, today);
  return build("kosaf", KOSAF, today);
}
