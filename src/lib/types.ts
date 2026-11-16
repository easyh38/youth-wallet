// PRD 6-2 공통 Policy 구조 + 매칭에 필요한 보조 필드

export type Source = "youth" | "gov24" | "kosaf";
export type Category = "housing" | "scholarship" | "job" | "startup" | "welfare" | "etc";

/** 조건이 문장으로만 적혀 있어 숫자로 바꾸지 못한 항목 (null이지만 "조건 없음"은 아님) */
export type UnknownField = "region" | "age" | "income" | "student" | "employment" | "period";

export type Policy = {
  id: string; // "{source}-{원본ID}"
  source: Source;
  title: string;
  agency: string;
  category: Category;
  regionCodes: string[]; // 전국이면 ["ALL"], 시·도 2자리 또는 시·군·구 5자리
  ageMin: number | null;
  ageMax: number | null;
  incomeMax: number | null; // 소득분위 상한, 조건 없으면 null
  studentStatus: string[] | null; // 조건 없으면 null
  employmentStatus: string[] | null; // 조건 없으면 null
  applyStart: string | null; // YYYY-MM-DD
  applyEnd: string | null;
  isAlwaysOpen: boolean;
  summaryRaw: string;
  detailUrl: string;
  attachmentUrls: string[];
  /** 아래는 PRD 구조에 더한 보조 필드 */
  unknownFields?: UnknownField[];
  amountMax?: number | null; // 원 단위, 원본에 숫자로 있을 때만
  /** 원본 API가 항목별로 나눠 준 정보 (온통청년: 지원 내용·신청 방법·제출 서류 등). 상세 화면에 그대로 보여준다 */
  details?: PolicyDetailItem[];
  /** 정책 키워드 (온통청년 plcyKywdNm) */
  keywords?: string[];
  /** 신청·참고 링크 (detailUrl 외에 더 있을 때) */
  links?: { label: string; url: string }[];
};

export type PolicyDetailItem = { label: string; value: string };

export const STUDENT_STATUSES = ["재학", "휴학", "졸업예정", "졸업", "해당 없음"] as const;
export const EMPLOYMENT_STATUSES = ["미취업", "재직", "창업 준비", "자영업"] as const;
export const INTERESTS = ["주거", "장학금", "취업", "창업", "생활·복지"] as const;

export type StudentStatus = (typeof STUDENT_STATUSES)[number];
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];
export type Interest = (typeof INTERESTS)[number];

export type UserProfile = {
  regionCode: string; // 시·군·구 5자리
  birthYear: number;
  incomeLevel: number | null; // 1~10, 모름이면 null
  studentStatus: StudentStatus;
  employmentStatus: EmploymentStatus;
  interests: Interest[];
};

export type MatchStatus = "eligible" | "check" | "excluded";

export type MatchResult = {
  status: MatchStatus;
  reasons: string[]; // 확인 필요/제외 사유
};

export const CATEGORY_LABEL: Record<Category, string> = {
  housing: "주거",
  scholarship: "장학금",
  job: "취업",
  startup: "창업",
  welfare: "생활·복지",
  etc: "기타",
};

export const INTEREST_TO_CATEGORY: Record<Interest, Category> = {
  주거: "housing",
  장학금: "scholarship",
  취업: "job",
  창업: "startup",
  "생활·복지": "welfare",
};

export const SOURCE_LABEL: Record<Source, string> = {
  youth: "온통청년",
  gov24: "보조금24",
  kosaf: "장학재단",
};

export type Summary = {
  target: string | null;
  amount: string | null;
  deadline: string | null;
  isAlwaysOpen: boolean;
  documents: string[];
  applyMethod: string | null;
};
