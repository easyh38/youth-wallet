"use client";

import dynamic from "next/dynamic";

// 데모는 브라우저 크기를 재고 움직이는 장면이라 서버에서 그리지 않는다 (하이드레이션 불일치 방지).
// 불러오는 동안에는 같은 비율의 자리를 잡아 레이아웃이 밀리지 않게 한다.
const HeroDemo = dynamic(() => import("./HeroDemo").then((m) => m.HeroDemo), {
  ssr: false,
  loading: () => <div className="aspect-[358/356] w-full min-[560px]:aspect-[720/440]" />,
});

export function HeroDemoClient() {
  return <HeroDemo />;
}
