import { dDay, kstDate } from "./date";
import { formatDate, formatWon } from "./format";
import { eligibleAmountOf, matchAll, matchPolicy, sortMatched } from "./match";
import { searchPolicies } from "./search";
import { samplePolicies } from "./sources/sample";
import { INTEREST_TO_CATEGORY, SOURCE_LABEL, type Category, type MatchResult, type Policy, type Source, type UserProfile } from "./types";

export type AssistantPolicyQuery = {
  category?: Category;
  search?: string;
  selectedPolicyId?: string;
  status?: "eligible" | "check";
  sources?: Source[];
  interests?: boolean;
};

export type AssistantContext = {
  pathname: string;
  profile: UserProfile | null;
  signedIn?: boolean;
  policies: Policy[];
  selectedPolicy?: Policy;
  sampleSources: readonly Source[];
  unavailableSources?: readonly Source[];
  policyQuery?: AssistantPolicyQuery;
  saved?: readonly { policy: Policy; status: string }[];
  notifications?: { unread: number; recent: readonly { policyId: string; message: string; isRead: boolean }[] };
  today?: string;
};

type PolicyReference = Pick<Policy, "id" | "title" | "source"> & { sample: boolean };
type Link = { href: string; label: string };

export type AssistantEvidence = PolicyReference & {
  category: Category;
  agency: string;
  matchStatus: MatchResult["status"] | null;
  matchReasons: string[];
  facts: {
    benefit: string | null;
    target: string | null;
    applicationWindow: string | null;
    applicationMethod: string | null;
    documents: string | null;
    selection: string | null;
  };
};

export type AssistantTopic = "policies" | "saved" | "notifications" | "navigation" | "help";

type AssistantReply = {
  topic: AssistantTopic;
  answer: string;
  policies: PolicyReference[];
  links?: Link[];
  evidence: AssistantEvidence[];
};

const LIMIT = 3;
const PROFILE = { href: "/profile", label: "내 조건 입력·수정" };
const POLICIES = { href: "/policies", label: "정책 찾기" };
const MY = { href: "/my", label: "내 정책" };
const NOTIFICATIONS = { href: "/notifications", label: "알림" };
const ME = { href: "/me", label: "내 정보" };
const HOME = { href: "/", label: "홈" };
const LOGIN = { href: "/login", label: "로그인" };
const SAMPLE_IDS = new Set((Object.keys(SOURCE_LABEL) as Source[]).flatMap((source) => samplePolicies(source).map(({ id }) => id)));

const CATEGORIES: readonly [Category, RegExp][] = [
  ["housing", /주거|월세|전세|임대(?:료|차|보증금)?|보증금/],
  ["scholarship", /장학|학자금|등록금/],
  ["job", /취업|구직|면접|일자리|직업\s*훈련/],
  ["startup", /창업|사업화/],
  ["welfare", /복지|생활비|바우처/],
];

const FOLLOW_UP = /(?:^|\s)[이그]\s*(?:정책|지원금|공고|사업|거|건|걸|것|중)|아까|방금|지금\s*(?:보고\s*있는|보는)|(?:첫|두|세)\s*번째/;
const NEW_TOPIC = /말고|이번엔|이번에는|대신/;
const DETAIL = /신청\s*(?:방법|서류|기간|대상|조건)|어디서\s*신청|어떻게\s*(?:신청|받)|신청은\s*어디|자격|대상|지원\s*내용|얼마|금액|혜택|서류|마감|언제|요약|설명|뭐야|가능해|될까/;
const SAVED = /저장한|저장된|저장\s*목록|내\s*정책|찜한|북마크|신청\s*완료한/;
const ALERT = /알림|통지|읽지\s*않은/;
const NAVIGATION = /어디|이동|메뉴|열어|켜는\s*법|끄는\s*법/;
const ALERT_SETTINGS = /알림\s*설정|알림.{0,14}(?:켜|끄|꺼|어떻게\s*받|받는\s*법)/;
const ACTION = /대신\s*신청|신청해\s*줘|삭제해\s*줘|저장해\s*줘|읽음\s*(?:처리|표시)해\s*줘|알림\s*(?:켜|꺼)\s*줘/;
const URGENT = /곧\s*마감|마감\s*(?:임박|가까운)|이번\s*(?:주|달)/;
const DASHBOARD_COUNT = /(?:신청\s*가능한?|확인\s*필요한?|맞춤\s*정책)\s*(?:정책[이가]?\s*)?(?:건수|개수|몇\s*[건개])/;
const GENERIC = new Set([
  "청년", "지원", "정책", "정책들", "지원금", "지원금들", "공고", "사업", "추천", "찾기", "검색", "분야", "내", "나", "가장", "현재", "지금", "요즘", "오늘", "오픈",
  "신청", "가능", "조건", "내용", "어떤", "어느", "어디", "어디서", "어떻게", "뭐", "알려", "보여", "해줘", "싶어", "좋아", "되는", "할", "수", "있는", "받을", "받는",
  "없어", "있어", "있을까", "싶은", "궁금해", "대상", "자격", "얼마", "얼마야", "얼마예", "금액", "혜택", "방법", "서류", "준비물", "마감", "마감일", "기간", "언제",
  "요약", "설명", "뭐야", "가능해", "될까", "관련", "새로운", "맞는", "맞춤", "주거", "장학금", "취업", "창업", "생활복지", "복지", "필요해", "필요한", "확인해", "봐줘", "말고",
]);

function compact(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function questionTerms(message: string): string {
  return message
    .replace(/(?:첫|두|세)\s*번째|(?:^|\s)[이그]\s*(?:거|건|걸|것|중)|이\s*화면|여기서?|지금\s*(?:보고\s*있는|보는)|현재\s*필터|선택한\s*분야/g, " ")
    .replace(/내\s*조건(?:에\s*맞는)?|신청\s*(?:가능한|할\s*수\s*있는)|(?:지원\s*)?받을\s*수\s*있는/g, " ")
    .replace(/신청\s*(?:방법|기간|조건|서류|대상)|지원\s*(?:금액|내용)|어디서\s*신청|어떻게\s*(?:신청|받)|신청은\s*어디서?|언제까지/g, " ")
    .replace(/곧\s*마감|마감\s*(?:임박|가까운)|이번\s*(?:주|달)|(?:찾아|알아봐|추천해|알려|보여|설명해|요약해)\s*(?:줘|주세요)/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.replace(/(?:지원금|정책)(?:을|를|이|가|은|는|은요|는요)$/, "").replace(/(?:있을까요|있나요|있어요|거야|인가요|은요|는요|하고|에서|으로|까지|에게|를|을|는|은|이|가|좀|요)$/, ""))
    .filter((word) => word.length >= 2 && !GENERIC.has(word))
    .slice(0, 8)
    .join(" ");
}

function contextualQuestion(message: string, previousQuestion?: string) {
  return previousQuestion && !NEW_TOPIC.test(message) && (FOLLOW_UP.test(message) || (DETAIL.test(message) && !questionTerms(message)))
    ? `${previousQuestion} ${message}`
    : message;
}

function asksDashboardTotals(message: string, pathname: string) {
  if (pathname !== "/policies" || /이\s*(?:정책|공고)|찾아|추천/.test(message)) return false;
  if (DASHBOARD_COUNT.test(message)) return true;
  return /최대\s*(?:지원금|금액)|지원금\s*(?:합계|총액)/.test(message) && /화면|여기|위에|상단|계산|표시|합계|총액/.test(message);
}

function targetPage(message: string): Link | undefined {
  if (ALERT_SETTINGS.test(message) || /내\s*정보|계정/.test(message)) return ME;
  if (/프로필|내\s*조건|조건.{0,10}(?:바꾸|수정|입력)/.test(message)) return PROFILE;
  if (SAVED.test(message)) return MY;
  if (ALERT.test(message)) return NOTIFICATIONS;
  if (/홈|첫\s*화면/.test(message)) return HOME;
  if (/로그인/.test(message)) return LOGIN;
  if (/정책|지원금|찾기|검색/.test(message) && !/신청/.test(message) && !FOLLOW_UP.test(message) && !DETAIL.test(message)) return POLICIES;
}

export function assistantTopic(message: string, context: Pick<AssistantContext, "pathname">, previousQuestion?: string): AssistantTopic {
  const question = contextualQuestion(message, previousQuestion);
  if (ACTION.test(message)) return "help";
  if (asksDashboardTotals(message, context.pathname)) return "policies";
  if ((NAVIGATION.test(message) && targetPage(message)) || ALERT_SETTINGS.test(message)) return "navigation";
  if (context.pathname === "/my" && /서류|체크리스트/.test(message) && !questionTerms(message.replace(/체크리스트/g, ""))) return "navigation";
  if (ALERT.test(question)) return "notifications";
  if (SAVED.test(question)) return "saved";
  if (/이\s*화면|여기(?:서)?\s*(?:뭘|뭐|무엇)/.test(message)) {
    if (context.pathname === "/my") return "saved";
    if (context.pathname === "/notifications") return "notifications";
    if (context.pathname === "/profile" || context.pathname === "/me") return "navigation";
    if (context.pathname.startsWith("/policies")) return "policies";
  }
  if (/^\s*(?:안녕(?:하세요)?|반가워|고마워|감사합니다)[.!?\s]*$|뭐\s*할\s*수\s*있|무슨\s*기능|사용법/.test(message)) return "help";
  if (/지원|정책|공고|추천|찾|대상|조건|신청/.test(question) || DETAIL.test(question)
    || CATEGORIES.some(([, pattern]) => pattern.test(question)) || questionTerms(question)) return "policies";
  return "help";
}

function reply(topic: AssistantTopic, answer: string, links?: Link[], policies: PolicyReference[] = [], evidence: AssistantEvidence[] = []): AssistantReply {
  return { topic, answer, policies, links, evidence };
}

function asReference(policy: Policy, context: AssistantContext, snapshot = false): PolicyReference {
  const { id, title, source } = policy;
  // 저장 시점의 샘플은 실 API 키를 등록한 이후에도 스냅샷에 남을 수 있다.
  const sample = snapshot ? SAMPLE_IDS.has(id) : context.sampleSources.includes(source);
  return { id, title, source, sample };
}

function describeNavigation(message: string, context: AssistantContext): AssistantReply {
  const page = targetPage(message) ?? (context.pathname === "/profile" ? PROFILE : context.pathname === "/my" ? MY : ME);
  const descriptions: Record<string, string> = {
    "/": "홈에서 내 조건을 입력하고 지원 정책을 찾을 수 있어요.",
    "/profile": "거주 지역, 출생연도, 소득분위, 학적, 취업 상태와 관심 분야를 입력하거나 수정할 수 있어요.",
    "/policies": "찾기에서 분야, 검색어, 출처와 매칭 결과로 지원 정책을 좁힐 수 있어요.",
    "/my": "내 정책에서 저장한 공고, 체크리스트, 신청 완료 상태를 확인할 수 있어요. 제출 서류는 정책 상세에서 확인할 수 있어요.",
    "/notifications": "알림에서 저장한 정책의 마감 알림과 읽지 않은 항목을 확인할 수 있어요.",
    "/me": ALERT_SETTINGS.test(message)
      ? "내 정보에서 마감 알림을 켜면 저장한 정책의 마감 7일·3일·1일 전 오전 9시에 앱에서 알려 드려요."
      : "내 정보에서 저장한 프로필을 확인하고 마감 알림을 설정할 수 있어요.",
    "/login": "로그인하면 저장한 정책과 마감 알림을 확인할 수 있어요.",
  };
  return reply("navigation", descriptions[page.href], [page]);
}

function describeSaved(question: string, context: AssistantContext): AssistantReply {
  const saved = context.saved;
  if (!saved) return context.signedIn
    ? reply("saved", "지금 저장 목록을 불러올 수 없어요. 내 정책에서 다시 확인해 주세요.", [MY])
    : reply("saved", "로그인하면 내 정책에 저장한 공고를 확인할 수 있어요.", [LOGIN]);
  if (!saved.length) return reply("saved", "아직 저장한 정책이 없어요. 관심 있는 공고를 열어 저장할 수 있어요.", [POLICIES]);

  const today = context.today ?? kstDate();
  const applied = /신청\s*완료/.test(question);
  const deadline = /마감|이번\s*(?:주|달)/.test(question);
  const savedMatches = saved.filter(({ policy, status }) => {
    if (applied) return status === "applied";
    if (!deadline) return true;
    return status !== "applied" && Boolean(policy.applyEnd && !policy.isAlwaysOpen && policy.applyEnd >= today);
  });
  if (deadline) savedMatches.sort((a, b) => (a.policy.applyEnd ?? "").localeCompare(b.policy.applyEnd ?? ""));
  const label = applied ? "신청 완료로 표시한 정책" : deadline ? "마감일이 남은 저장 정책" : "저장한 정책";
  if (!savedMatches.length) return reply("saved", `${label}이 없어요.`, [MY]);

  const items = savedMatches.slice(0, LIMIT);
  const references = items.map(({ policy }) => asReference(policy, context, true));
  const notes = references.some(({ sample }) => sample) ? "\n연습용 정책은 실제 공고와 다를 수 있어요." : "";
  const names = items.map(({ policy }) => `• ${policy.title}${deadline && policy.applyEnd ? ` · ${formatDate(policy.applyEnd)} 마감` : ""}`);
  return reply("saved", `${label} ${savedMatches.length}건이에요.\n${names.join("\n")}${notes}`, [MY], references);
}

function cleanText(value: string, limit: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

function describeNotifications(question: string, context: AssistantContext): AssistantReply {
  const notifications = context.notifications;
  if (!notifications) return context.signedIn
    ? reply("notifications", "지금 알림을 불러올 수 없어요. 알림 화면에서 다시 확인해 주세요.", [NOTIFICATIONS])
    : reply("notifications", "로그인하면 저장한 정책에 대한 마감 알림을 확인할 수 있어요.", [LOGIN]);
  if (!notifications.recent.length && !notifications.unread) return reply("notifications", "아직 받은 마감 알림이 없어요.", [NOTIFICATIONS]);
  const recent = /읽지\s*않|안\s*읽|새\s*알림/.test(question) ? notifications.recent.filter((item) => !item.isRead) : notifications.recent;
  const messages = recent.slice(0, LIMIT).map((item) => `• ${cleanText(item.message, 180)}`);
  return reply("notifications", [`읽지 않은 알림은 ${notifications.unread}건이에요.`, ...messages].join("\n"), [NOTIFICATIONS]);
}

function selectedId(pathname: string, query?: AssistantPolicyQuery) {
  const segment = /^\/policies\/([^/]+)\/?$/.exec(pathname)?.[1];
  if (!segment) return pathname === "/policies" ? query?.selectedPolicyId : undefined;
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

function getMatch(profile: UserProfile | null, policy: Policy, today: string): MatchResult | null {
  if (!profile) return null;
  const match = matchPolicy(profile, policy, today);
  if (match.status !== "excluded" && !policy.isAlwaysOpen && policy.applyStart && policy.applyStart > today) {
    return { status: "check", reasons: [`신청 시작일은 ${formatDate(policy.applyStart)}이에요`, ...match.reasons] };
  }
  return match;
}

function period(policy: Policy, today: string) {
  if (policy.isAlwaysOpen) return "상시 모집";
  if (!policy.applyEnd) return fact(policy, /^(?:신청기간|신청기한)$/);
  const end = formatDate(policy.applyEnd);
  if (policy.applyEnd < today) return `${end} 마감됨`;
  if (policy.applyStart && policy.applyStart > today) return `${formatDate(policy.applyStart)} 신청 시작 · ${end} 마감`;
  return `${end} 마감`;
}

function fact(policy: Policy, label: RegExp): string | null {
  const details = policy.details?.find((item) => label.test(compact(item.label)) && item.value.trim());
  if (details) return cleanText(details.value, 260);
  for (const line of policy.summaryRaw.split(/\r?\n/)) {
    const colon = line.search(/[:：]/);
    if (colon >= 0 && label.test(compact(line.slice(0, colon)))) return cleanText(line.slice(colon + 1), 260) || null;
  }
  return null;
}

function asEvidence(policy: Policy, match: MatchResult | null, context: AssistantContext, today: string): AssistantEvidence {
  return {
    ...asReference(policy, context),
    category: policy.category,
    agency: policy.agency,
    matchStatus: match?.status ?? null,
    matchReasons: match?.reasons ?? [],
    facts: {
      benefit: fact(policy, /^(?:지원내용|정책소개)$/),
      target: fact(policy, /^(?:지원대상|추가자격조건)$/),
      applicationWindow: period(policy, today),
      applicationMethod: fact(policy, /^(?:신청방법|신청절차)$/),
      documents: fact(policy, /^(?:제출서류|구비서류|신청서류)$/),
      selection: fact(policy, /^(?:선발기준|선정기준|심사방법)$/),
    },
  };
}

function matchLabel(evidence: AssistantEvidence) {
  if (evidence.matchStatus === "eligible") return "입력한 조건 기준 신청 가능";
  if (evidence.matchStatus === "check") return "조건 확인 필요";
  if (evidence.matchStatus === "excluded") return "입력한 조건 기준 제외";
  return "공고 정보";
}

function describePolicy(evidence: AssistantEvidence, message: string) {
  const { facts } = evidence;
  const entries: [RegExp, string, string | null][] = [
    [/얼마|금액|혜택|지원\s*내용/, "지원 내용", facts.benefit],
    [/대상|자격|조건|가능해|될까|받을\s*수/, "지원 대상", facts.target],
    [/마감|언제|신청\s*기간/, "신청 기간", facts.applicationWindow],
    [/어디|어떻게|신청\s*방법|절차/, "신청 방법", facts.applicationMethod],
    [/서류|준비물/, "제출 서류", facts.documents],
    [/선정|선발|심사/, "선정 기준", facts.selection],
  ];
  const requested = entries.filter(([pattern]) => pattern.test(message));
  const lines = requested.length
    ? requested.map(([, label, value]) => `• ${label} — ${value ?? "공고문에서 확인해 주세요."}`)
    : [facts.benefit, facts.applicationWindow].filter(Boolean).map((value) => `• ${value}`);
  const reason = evidence.matchReasons.slice(0, 2).join(". ");
  return [`${evidence.title} · ${matchLabel(evidence)} · ${SOURCE_LABEL[evidence.source]}${evidence.sample ? " (연습용)" : ""}`, ...lines, reason].filter(Boolean).join("\n");
}

function references(evidence: AssistantEvidence[]): PolicyReference[] {
  return evidence.map(({ id, title, source, sample }) => ({ id, title, source, sample }));
}

function policyNote(evidence: AssistantEvidence[], context: AssistantContext) {
  const sample = evidence.some((item) => item.sample) ? "연습용 정책의 내용과 날짜는 실제 공고와 다를 수 있어요." : "";
  const condition = context.profile ? "세부 자격과 접수 여부는 공고문에서 확인해 주세요." : "내 조건을 입력하면 신청 가능 여부도 비교할 수 있어요.";
  return [sample, condition].filter(Boolean).join(" ");
}

function describeDashboardTotals(context: AssistantContext): AssistantReply {
  if (!context.profile) return reply("policies", "내 조건을 입력하면 정책 찾기 화면에 신청 가능 건수와 지원 금액이 표시돼요.", [PROFILE]);

  const { counts, results } = matchAll(context.profile, context.policies, context.today);
  const total = eligibleAmountOf(results);
  const amount = total > 0 ? ` 최대 지원금은 ${formatWon(total)}이에요.` : "";
  const sample = context.sampleSources.length ? "\n연습용 정책이 포함된 결과예요." : "";
  const unavailable = context.unavailableSources?.length ? `\n${context.unavailableSources.map((source) => SOURCE_LABEL[source]).join("·")} 자료를 일부 불러오지 못했어요.` : "";
  return reply("policies", `입력한 조건으로 전체 공고를 비교한 결과, 신청 가능 ${counts.eligible}건, 조건 확인 필요 ${counts.check}건이에요.${amount}\n최대 지원금은 신청 가능으로 분류된 공고 중 숫자로 표시된 최대 금액을 더한 값이에요.${sample}${unavailable}`);
}

function lookUpPolicies(message: string, question: string, context: AssistantContext): AssistantReply {
  const today = context.today ?? kstDate();
  const search = questionTerms(question);
  const categories = CATEGORIES.filter(([, pattern]) => pattern.test(question)).map(([category]) => category);
  const explicit = Boolean(search || categories.length);
  const clientQuery = context.pathname === "/policies" ? context.policyQuery : undefined;
  const id = selectedId(context.pathname, clientQuery);
  const selected = id ? context.selectedPolicy ?? context.policies.find((policy) => policy.id === id) : undefined;
  const upcoming = URGENT.test(message);
  const ordinal = /([첫두세])\s*번째/.exec(message)?.[1];
  const titleAnchor = compact(question);
  const named = context.policies
    .filter((policy) => {
      const title = compact(policy.title);
      return title.length >= 5 && titleAnchor.includes(title);
    })
    .sort((a, b) => b.title.length - a.title.length)[0];
  const fromPreviousTopic = question !== message;
  const selectedDetail = !NEW_TOPIC.test(message) && (FOLLOW_UP.test(message) || (DETAIL.test(message) && !explicit && !upcoming && !/찾아|추천|알아봐/.test(message)));
  // 다른 정책을 이미 찾은 다음의 후속 질문에는 현재 패널보다 그 검색 결과가 우선이다.
  const mentionsScreenPolicy = /(?:^|\s)이\s*(?:정책|공고)|지금\s*(?:보고\s*있는|보는)/.test(message);
  const preferScreen = !ordinal && selectedDetail && (!fromPreviousTopic || !explicit || mentionsScreenPolicy);
  const detail = preferScreen && mentionsScreenPolicy && selected ? selected : named ?? (preferScreen ? selected : undefined);
  if (detail) {
    const evidence = [asEvidence(detail, getMatch(context.profile, detail, today), context, today)];
    return reply("policies", `${describePolicy(evidence[0], message)}\n\n${policyNote(evidence, context)}`, context.profile ? undefined : [PROFILE], references(evidence), evidence);
  }
  if (id && preferScreen) return reply("policies", "지금 이 정책의 공고 정보를 불러올 수 없어요.", [POLICIES]);

  // 현재 필터는 화면에 대한 질문에만 적용하고, 새 검색어·분야를 말하면 전체 데이터에서 찾는다.
  const view = explicit ? undefined : clientQuery;
  const interestCategories = context.profile?.interests.map((interest) => INTEREST_TO_CATEGORY[interest]) ?? [];
  const daysUntilSunday = (7 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7;
  const scoped = context.policies.filter((policy) => {
    if (categories.length && !categories.includes(policy.category)) return false;
    if (view?.category && view.category !== policy.category) return false;
    if (view?.interests && !interestCategories.includes(policy.category)) return false;
    if (view?.sources && !view.sources.includes(policy.source)) return false;
    if (upcoming) {
      const days = dDay(policy.applyEnd, today);
      if (policy.isAlwaysOpen || days == null || days < 0) return false;
      if (/이번\s*달/.test(message)) return policy.applyEnd?.slice(0, 7) === today.slice(0, 7);
      return days <= (/이번\s*주/.test(message) ? daysUntilSunday : 7);
    }
    return true;
  });
  const matched = scoped.map((policy) => ({ policy, ...(getMatch(context.profile, policy, today) ?? { status: "check" as const, reasons: [] }) }));
  const sorted = sortMatched(matched);
  const lookup = searchPolicies(sorted, search || view?.search || "");
  const eligibleOnly = view?.status === "eligible" || /신청\s*(?:가능한|할\s*수\s*있는)|지금\s*신청\s*가능/.test(message);
  const open = lookup.filter(({ policy, status }) => {
    if (status === "excluded" || (view?.status && status !== view.status)) return false;
    return policy.isAlwaysOpen || !policy.applyEnd || policy.applyEnd >= today;
  });
  const visible = eligibleOnly ? open.filter(({ status }) => status === "eligible") : open;
  const otherMatches = !visible.length && eligibleOnly && context.profile && !view?.status && !/가능한?\s*(?:것|정책|공고)?만/.test(message)
    ? open
    : [];
  // 사용자가 정책명 일부와 세부 항목을 물으면, 마감·제외된 공고도 이름이 맞는 경우 설명한다.
  const exactLookup = explicit && !upcoming && !eligibleOnly && DETAIL.test(message) && lookup.length === 1 ? lookup : undefined;
  const offset = ordinal === "두" ? 1 : ordinal === "세" ? 2 : 0;
  const items = ordinal ? visible.slice(offset, offset + 1) : exactLookup ?? (otherMatches.length ? otherMatches : visible);
  if (!items.length) {
    const availability = context.unavailableSources?.length ? ` ${context.unavailableSources.map((source) => SOURCE_LABEL[source]).join("·")} 자료는 현재 일부 확인하기 어려워요.` : "";
    const hint = !context.profile && eligibleOnly ? "내 조건을 입력하면 신청 가능 여부를 비교할 수 있어요." : "해당하는 공고를 찾지 못했어요. 정책명이나 분야를 바꿔 검색해 보세요.";
    return reply("policies", `${hint}${availability}`, context.profile ? [POLICIES] : [PROFILE, POLICIES]);
  }

  const evidence = items.slice(0, LIMIT).map(({ policy, status, reasons }) => asEvidence(policy, context.profile ? { status, reasons } : null, context, today));
  const intro = otherMatches.length
    ? "신청 가능으로 분류된 공고는 없어요. 조건 확인이 필요한 공고를 보여드려요.\n\n"
    : items.length > 1 ? `찾은 공고 ${items.length}건 중 ${evidence.length}건을 보여드려요.\n\n` : "";
  const details = evidence.map((item) => describePolicy(item, message)).join("\n\n");
  return reply("policies", `${intro}${details}\n\n${policyNote(evidence, context)}`, context.profile ? undefined : [PROFILE], references(evidence), evidence);
}

export function assistantReply(message: string, context: AssistantContext, previousQuestion?: string): AssistantReply {
  const topic = assistantTopic(message, context, previousQuestion);
  const question = contextualQuestion(message, previousQuestion);
  if (topic === "navigation") return describeNavigation(message, context);
  if (topic === "saved") return describeSaved(question, context);
  if (topic === "notifications") return describeNotifications(question, context);
  if (topic === "policies") {
    return asksDashboardTotals(message, context.pathname) ? describeDashboardTotals(context) : lookUpPolicies(message, question, context);
  }
  if (ACTION.test(message)) return reply("help", "신청, 저장과 상태 변경은 해당 정책이나 내 정책 화면에서 진행해 주세요.", [POLICIES, MY]);
  return reply("help", "정책을 찾고 신청 대상, 지원 내용, 마감일과 신청 방법을 확인해 드려요. ‘월세 지원 찾아줘’처럼 물어보세요.");
}
