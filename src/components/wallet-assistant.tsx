"use client";

import { ArrowRight, LoaderCircle, MessageCircleMore, SendHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Badge, Button, ErrorBox, SourceBadge } from "@/components/ui";
import { ApiError, api, loadAssistantGuestProfile } from "@/lib/client";
import { CATEGORY_LABEL, type Source } from "@/lib/types";
import type { AssistantPolicyQuery } from "@/lib/wallet-assistant";

type AssistantReply = {
  answer: string;
  policies: { id: string; title: string; source: Source; sample: boolean }[];
  links?: { href: string; label: string }[];
  explanation?: string;
};

type Turn = { id: number; question: string; contextKey: string; reply?: AssistantReply; error?: string };

const MAX_QUESTION = 500;
const NAV_LINKS = new Set(["/", "/profile", "/policies", "/my", "/notifications", "/me", "/login", "/signup"]);
const PolicyQueryContext = createContext<(value: AssistantPolicyQuery | undefined) => void>(() => {});

export function AssistantPolicyContext({ value }: { value: AssistantPolicyQuery }) {
  const publish = useContext(PolicyQueryContext);
  useEffect(() => {
    publish(value);
    return () => publish(undefined);
  }, [publish, value]);
  return null;
}

export function WalletAssistantProvider({ children }: { children: ReactNode }) {
  const [policyQuery, setPolicyQuery] = useState<AssistantPolicyQuery>();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  return (
    <PolicyQueryContext.Provider value={setPolicyQuery}>
      {children}
      <WalletAssistant
        key={session?.user?.id ? `account:${session.user.id}` : status}
        pathname={pathname}
        policyQuery={pathname === "/policies" ? policyQuery : undefined}
        guest={status === "unauthenticated"}
        ready={status !== "loading"}
      />
    </PolicyQueryContext.Provider>
  );
}

function screenPrompts(pathname: string, policyQuery?: AssistantPolicyQuery) {
  if (policyQuery?.selectedPolicyId || pathname.startsWith("/policies/")) {
    return { label: "정책 상세", prompts: ["이 정책 신청 조건 알려줘", "어떻게 신청해요?", "어떤 서류가 필요해요?"] };
  }
  if (pathname === "/policies") {
    const area = policyQuery?.category ? CATEGORY_LABEL[policyQuery.category] : policyQuery?.interests ? "관심 분야" : "";
    return {
      label: area ? `정책 찾기 · ${area}` : "정책 찾기",
      prompts: ["지금 보고 있는 정책을 설명해 줘", "신청 가능한 정책 찾아줘", "최대 지원금은 어떻게 계산해요?"],
    };
  }
  if (pathname === "/my") return { label: "내 정책", prompts: ["저장한 정책 중 마감이 가까운 건?", "신청 서류는 어디서 확인해요?"] };
  if (pathname === "/notifications") return { label: "알림", prompts: ["읽지 않은 알림 알려줘", "마감 알림은 어떻게 받아요?"] };
  const label = pathname === "/profile" ? "내 조건" : pathname === "/me" ? "내 정보" : "청년지갑";
  return { label, prompts: ["내 조건에 맞는 월세 지원 찾아줘", "신청할 수 있는 장학금 찾아줘", "내 조건은 어디서 바꿔요?"] };
}

function Reply({ reply, close }: { reply: AssistantReply; close: () => void }) {
  const links = reply.links?.filter(({ href }) => NAV_LINKS.has(href)) ?? [];
  return (
    <section aria-label="도우미 답변" className="flex flex-col gap-2">
      <p className="rounded-2xl rounded-tl-sm bg-paper px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">{reply.answer}</p>
      {reply.explanation && (
        <section aria-label="AI 추가 설명" className="rounded-2xl border border-line px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-ink-muted">AI 추가 설명</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{reply.explanation}</p>
        </section>
      )}
      {reply.policies.length > 0 && (
        <ul aria-label="참고 정책" className="grid gap-1.5">
          {reply.policies.map((policy) => (
            <li key={policy.id}>
              <Link
                href={`/policies/${encodeURIComponent(policy.id)}`}
                onNavigate={close}
                prefetch={false}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-sm hover:bg-paper focus-visible:outline-offset-0"
              >
                <span className="grid gap-1">
                  <span className="font-semibold">{policy.title}</span>
                  <span className="flex flex-wrap gap-1">
                    <SourceBadge source={policy.source} />
                    {policy.sample && <Badge tone="info">연습용 샘플</Badge>}
                  </span>
                </span>
                <ArrowRight size={16} className="shrink-0 text-ink-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {links.length > 0 && (
        <ul aria-label="관련 화면" className="flex flex-wrap gap-2">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} onNavigate={close} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold hover:bg-paper">
                {label} <ArrowRight size={14} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WalletAssistant({ pathname, policyQuery, guest, ready }: {
  pathname: string;
  policyQuery?: AssistantPolicyQuery;
  guest: boolean;
  ready: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const nextTurn = useRef(0);
  const id = useId();
  const screen = screenPrompts(pathname, policyQuery);
  const contextKey = JSON.stringify([pathname, policyQuery]);
  const latest = turns.at(-1);
  const pending = !!latest && !latest.reply && !latest.error;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (open && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, turns]);

  function show() {
    dialog.current?.showModal();
    setOpen(true);
    heading.current?.focus({ preventScroll: true });
  }

  function close() {
    dialog.current?.close();
    setOpen(false);
  }

  async function ask(text: string, retryId?: number) {
    const question = text.trim();
    if (!question || !ready || request.current) return;

    const controller = new AbortController();
    request.current = controller;
    const previousQuestion = turns.findLast((turn) => turn.reply && turn.contextKey === contextKey)?.question;
    const current = { id: retryId ?? nextTurn.current++, question, contextKey };
    const replaceLatest = (update: Turn) => setTurns((previous) => [...previous.slice(0, -1), update]);
    if (retryId !== undefined) replaceLatest(current);
    else setTurns((previous) => [...previous, current]);

    try {
      const result = await api<AssistantReply>("/api/assistant", {
        method: "POST",
        signal: controller.signal,
        json: {
          message: question,
          pathname,
          policyQuery,
          previousQuestion,
          guestProfile: guest ? loadAssistantGuestProfile() ?? undefined : undefined,
        },
      });
      if (!controller.signal.aborted) replaceLatest({ ...current, reply: result });
    } catch (error) {
      if (!controller.signal.aborted) {
        replaceLatest({ ...current, error: error instanceof ApiError ? error.message : "답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." });
      }
    } finally {
      request.current = null;
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="accent"
        aria-haspopup="dialog"
        aria-controls={id}
        aria-expanded={open}
        onClick={show}
        className="fixed right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-35 min-h-12 border border-on-accent/10 px-4 shadow-md sm:right-5 lg:bottom-5"
      >
        <MessageCircleMore size={20} aria-hidden /> 도움받기
      </Button>
      <dialog
        ref={dialog}
        id={id}
        aria-labelledby={`${id}-title`}
        onClose={() => setOpen(false)}
        onCancel={(event) => { event.preventDefault(); close(); }}
        onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
        className="anim-fade fixed inset-auto right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] m-0 h-[min(38rem,calc(100dvh_-_6rem_-_env(safe-area-inset-bottom)))] w-[calc(100%_-_1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/15 open:flex sm:right-5 lg:bottom-5 lg:h-[min(38rem,calc(100dvh_-_2.5rem))]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-paper py-3 pr-2 pl-4">
          <MessageCircleMore className="size-10 shrink-0 rounded-full bg-accent p-2.5 text-on-accent" aria-hidden />
          <hgroup className="min-w-0 flex-1">
            <h2 id={`${id}-title`} tabIndex={-1} ref={heading} className="font-bold focus:outline-none">정책 도우미</h2>
            <p className="truncate text-xs text-ink-muted">{screen.label}</p>
          </hgroup>
          <Button type="button" variant="ghost" aria-label="도우미 닫기" onClick={close} className="size-11 shrink-0 px-0!">
            <X size={20} aria-hidden />
          </Button>
        </header>

        <div ref={log} role="log" aria-label="도우미 대화" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-offset-[-2px]">
          <p className="rounded-2xl rounded-tl-sm bg-paper px-4 py-3 text-sm leading-relaxed">
            보고 있는 화면과 입력한 조건을 바탕으로 정책을 찾아드려요. 지원 대상, 신청 방법, 필요한 서류를 물어보세요.
          </p>
          {!turns.length && (
            <ul aria-label="추천 질문" className="mt-3 flex flex-wrap gap-2">
              {screen.prompts.map((prompt) => (
                <li key={prompt}>
                  <Button type="button" variant="secondary" disabled={!ready} className="px-3 text-left text-sm" onClick={() => { log.current?.focus({ preventScroll: true }); void ask(prompt); }}>
                    {prompt}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {turns.length > 0 && (
            <ol className="mt-4 grid gap-4">
              {turns.map((turn) => (
                <li key={turn.id} className="grid gap-3">
                  <p className="ml-7 justify-self-end rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm text-on-accent">
                    <span className="sr-only">내 질문 </span>{turn.question}
                  </p>
                  {turn.reply && <Reply reply={turn.reply} close={close} />}
                  {turn.error && <ErrorBox>{turn.error}</ErrorBox>}
                  {!turn.reply && !turn.error && (
                    <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
                      <LoaderCircle size={16} className="animate-spin" aria-hidden /> 관련 정보를 찾고 있어요
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {latest?.error && (
            <Button type="button" variant="secondary" disabled={!ready} className="mt-2 px-3 text-sm" onClick={() => { log.current?.focus({ preventScroll: true }); void ask(latest.question, latest.id); }}>
              다시 보내기
            </Button>
          )}
        </div>

        <form
          className="flex shrink-0 items-center gap-2 border-t border-line bg-surface p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim() || pending || !ready) return;
            void ask(draft);
            setDraft("");
          }}
        >
          <label htmlFor={`${id}-question`} className="sr-only">도우미에게 질문하기</label>
          <input
            id={`${id}-question`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_QUESTION}
            placeholder="궁금한 정책을 물어보세요"
            enterKeyHint="send"
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-base placeholder:text-ink-muted"
          />
          <Button type="submit" aria-label="질문 보내기" disabled={!draft.trim() || pending || !ready} className="size-11 shrink-0 px-0!">
            <SendHorizontal size={18} aria-hidden />
          </Button>
        </form>
      </dialog>
    </>
  );
}
