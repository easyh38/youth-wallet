import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { AppNav } from "@/components/nav";
import { WalletAssistantProvider } from "@/components/wallet-assistant";
import "./globals.css";

export const metadata: Metadata = {
  title: "청년지갑 — 숨은 지원금 원스톱 매칭",
  description: "내 조건만 입력하면 신청 가능한 청년 월세·장학금·취창업 지원금을 골라 3줄로 요약해 드려요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2f0" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1919" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <SessionProvider session={session}>
          <WalletAssistantProvider>
            <AppNav />
            <main className="pb-24 lg:pb-16">{children}</main>
          </WalletAssistantProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
