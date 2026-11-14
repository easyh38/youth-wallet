"use client";

// 홈 히어로의 제품 데모 (stageshow 키트).
// 이야기: 정책 카드에서 "3줄 요약 보기"를 누르면 요약이 열리고, ☆로 저장하면
// 마감 3일 전 알림이 남은 서류 수와 함께 도착한다. 되돌릴 때는 같은 자리에서 역순으로.

import { Bell, CalendarDays, Check, Star, Users, Wallet } from "lucide-react";
import type { Act } from "@/stageshow/kit/act";
import { Badge } from "@/stageshow/kit/controls/Badge";
import { Button } from "@/stageshow/kit/controls/Button";
import { Collapse } from "@/stageshow/kit/motion/Collapse";
import { Spinner } from "@/stageshow/kit/parts/Spinner";
import { Stage } from "@/stageshow/kit/stage";
import { Bar, Text, Window } from "@/stageshow/kit/window";
import "./hero-demo.css";

type S = { loading: boolean; summary: boolean; button: boolean; saved: boolean; notice: boolean };

const initial: S = { loading: false, summary: false, button: true, saved: false, notice: false };
const POSTER: S = { loading: false, summary: true, button: false, saved: true, notice: true };

// 커서가 쉬는 곳: 헤드라인 오른쪽의 빈 면
const REST = { wide: { x: 470, y: 96 }, compact: { x: 300, y: 76 } };

async function script(a: Act<S>) {
  await a.wait(700);

  // 1. 요약 요청
  await a.move({ at: "summary-btn", x: 0.95, y: 0.6 });
  await a.wait(200);
  await a.click();
  await a.set({ loading: true });
  await a.wait(700);

  // 2. 요약이 버튼 자리에서 열린다
  // 요약이 먼저 들어오고, 버튼은 그 뒤에 접힌다 (빈 프레임 없이 이어지게)
  await a.set({ summary: true });
  await a.wait(220);
  await a.set({ button: false, loading: false });
  await a.wait(1300);

  // 3. 저장
  await a.move({ at: "star", x: 0.5, y: 0.5 });
  await a.wait(150);
  await a.click();
  await a.set({ saved: true });
  await a.wait(700);

  // 4. 결과: 마감 알림이 도착하고 머문다
  await a.set({ notice: true });
  void a.move("rest");
  await a.wait(2800);

  // 같은 자리에서 역순으로 되돌린다 (알림 → 저장 → 요약)
  await a.set({ notice: false });
  await a.wait(90);
  await a.set({ saved: false });
  await a.wait(90);
  await a.set({ button: true });
  await a.wait(160);
  await a.set({ summary: false });
  await a.wait(900);
}

// 채움 카드의 막대 너비 (줄마다 다르게)
const FILLERS = {
  wide: [[52, 120, 60], [60, 138, 48], [46, 112, 70], [56, 128, 52], [50, 104, 64]],
  compact: [[60, 150, 70], [52, 132, 56]],
} as const;

const LINES = [
  { icon: Users, value: "만 19~34세 무주택 청년" },
  { icon: Wallet, value: "월 최대 20만 원 · 12개월", strong: true },
  { icon: CalendarDays, value: "2026.11.15 마감" },
];

export function HeroDemo() {
  return (
    <Stage
      width={720}
      height={440}
      compact={{ below: 560, width: 358, height: 356 }}
      initial={initial}
      poster={POSTER}
      script={script}
      cursor={{ at: REST }}
      className="yw"
    >
      {(s, _rect, layout) => (
        <>
          <Window url="localhost:3000/policies" urlShape="pill" className="yw-window">
            <div className="yw-app">
              {layout === "wide" && (
                <div className="yw-side" aria-hidden>
                  <Bar w={52} h={6} tone={2} />
                  <div className="yw-side-item" data-on>
                    <Text style={{ fontSize: 12 }}>전체</Text>
                    <span className="yw-side-count">11</span>
                  </div>
                  <div className="yw-side-item"><Bar w={58} h={6} tone={2} /><Bar w={10} h={6} tone={2} /></div>
                  <div className="yw-side-item"><Bar w={74} h={6} tone={2} /><Bar w={10} h={6} tone={2} /></div>
                  <Bar w={36} h={6} tone={2} style={{ marginTop: 18 }} />
                  <div className="yw-side-item"><Bar w={64} h={6} tone={2} /></div>
                  <div className="yw-side-item"><Bar w={50} h={6} tone={2} /></div>
                </div>
              )}

              <div className="yw-main" data-crop>
                {/* 모바일 설계에서는 창이 정사각형을 넘지 않도록 헤드라인을 뺀다 */}
                {layout === "wide" && (
                  <div className="yw-head">
                    신청 가능 <span className="yw-hl">3</span>개
                  </div>
                )}

                <div className="yw-grid" data-crop>
                  {/* 이야기의 주인공 카드 */}
                  <div className="yw-card" data-target="card">
                    <div className="yw-card-top">
                      <div className="yw-badges">
                        <Badge tone="success" icon={<Check size={11} strokeWidth={3} aria-hidden />}>신청 가능</Badge>
                        <Badge tone="danger">D-3</Badge>
                      </div>
                      <span className="yw-star" data-target="star" data-cursor="pointer" data-on={s.saved || undefined}>
                        <Star size={18} strokeWidth={1.8} aria-hidden />
                      </span>
                    </div>
                    <div className="yw-title">청년월세 특별지원</div>
                    <Bar w={64} h={6} tone={2} className="yw-agency" />

                    <div className="yw-rule" />
                    <Collapse open={s.button}>
                      <Button
                        data-target="summary-btn"
                        className="yw-btn"
                        size="large"
                        icon={s.loading ? <Spinner size={14} /> : undefined}
                      >
                        {s.loading ? "요약하는 중" : "3줄 요약 보기"}
                      </Button>
                    </Collapse>
                    <Collapse open={s.summary} reveal="drop">
                      <div className="yw-lines">
                        {LINES.map((l, i) => (
                          <div key={i} className="yw-line">
                            <l.icon size={16} strokeWidth={1.8} aria-hidden />
                            <span data-strong={l.strong || undefined}>{l.value}</span>
                          </div>
                        ))}
                      </div>
                    </Collapse>
                  </div>

                  {/* 나머지 카드는 채움: 오른쪽·아래 가장자리에서 잘려도 되는 것 */}
                  {FILLERS[layout].map((f, i) => (
                    <div key={i} className="yw-card yw-card--filler" aria-hidden>
                      <div className="yw-badges"><Bar w={f[0]} h={18} r={9} tone={1} /><Bar w={34} h={18} r={9} tone={1} /></div>
                      <Bar w={f[1]} h={9} tone={3} style={{ marginTop: 6 }} />
                      <Bar w={f[2]} h={6} tone={2} />
                      <div className="yw-rule" />
                      <Bar w={110} h={30} r={15} tone={1} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Window>

          {/* 결과: 앱 안 마감 알림. 제품이 띄우는 자리(창 아래쪽 토스트)에, 채움 카드 위로 */}
          <div className="yw-notice" data-show={s.notice || undefined} role="presentation">
            <span className="yw-notice-icon"><Bell size={16} strokeWidth={2} aria-hidden /></span>
            <div className="yw-notice-text">
              <div className="yw-notice-title">청년월세 특별지원 마감 D-3</div>
              <div className="yw-notice-sub">서류 1개 남았어요</div>
            </div>
          </div>

          <span data-target="rest" style={{ position: "absolute", left: REST[layout].x, top: REST[layout].y }} />
        </>
      )}
    </Stage>
  );
}
