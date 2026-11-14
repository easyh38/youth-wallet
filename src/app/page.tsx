import { ArrowRight, CalendarDays, ClipboardCheck, SlidersHorizontal } from "lucide-react";
import { HeroDemoClient } from "@/components/hero-demo";
import { ButtonLink } from "@/components/ui";

const STEPS = [
  { icon: SlidersHorizontal, title: "조건만 입력", body: "거주지·나이·학적 상태 등 5가지만 알려 주세요. 이름이나 연락처는 묻지 않아요." },
  { icon: ClipboardCheck, title: "신청 가능한 것만", body: "온통청년·보조금24·장학재단의 정책을 한 번에 모아 대상인 것만 골라 드려요." },
  { icon: CalendarDays, title: "마감 전에 알림", body: "저장한 정책은 D-7·D-3·D-1에 알려 드리고, 남은 서류도 함께 챙겨요." },
];

export default function Home() {
  return (
    <>
      <section className="overflow-hidden bg-deep text-on-deep">
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 pt-14 pb-12 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-12 lg:px-6 lg:py-20">
          <div className="flex flex-col gap-7">
            <p className="text-sm font-medium tracking-[0.02em] text-accent">청년 월세 · 장학금 · 취창업 지원금</p>
            <h1 className="display text-[36px] sm:text-[46px]">
              놓치고 있던 지원금,
              <br />
              1분이면 찾아요.
            </h1>
            <p className="max-w-xl text-[17px] text-on-deep/75">
              흩어진 공고문을 다 읽지 않아도 돼요. 신청할 수 있는 정책만 골라 지원 대상·금액·마감일 3줄로 보여 드려요.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/profile" variant="accent" className="min-h-12 px-7 text-base">
                내 조건으로 찾기 <ArrowRight size={18} aria-hidden />
              </ButtonLink>
            </div>
          </div>
          {/* 제품 데모: 장식이므로 보조기술에는 한 줄 설명만 */}
          <figure className="m-0 min-w-0" aria-label="정책 카드에서 3줄 요약을 열고 저장하면 마감 3일 전 알림이 오는 모습">
            <div aria-hidden>
              <HeroDemoClient />
            </div>
          </figure>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-16 lg:px-6">
        <h2 className="display mb-8 text-[24px] sm:text-[30px]">이렇게 도와드려요</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-surface p-6">
              <div className="mb-6 flex items-center justify-between">
                <s.icon size={24} aria-hidden />
                <span className="tnum text-sm font-semibold text-ink-muted">0{i + 1}</span>
              </div>
              <h3 className="mb-2 text-[18px] font-semibold tracking-[-0.01em]">{s.title}</h3>
              <p className="text-[15px] text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-[13px] text-ink-muted">
          청년지갑은 정책 신청을 대신하지 않아요. 원문 사이트로 연결해 드리며, AI 요약은 틀릴 수 있으니 신청 전 원문을 꼭 확인하세요.
        </p>
      </section>
    </>
  );
}
