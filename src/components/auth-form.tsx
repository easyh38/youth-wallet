"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { api, loadSessionProfile } from "@/lib/client";
import { safeNext } from "@/lib/redirect";
import { Button, ErrorBox } from "./ui";

const inputCls = "min-h-12 w-full rounded-lg border border-line bg-surface px-4 text-base focus:border-ink focus:outline-2 focus:outline-ink";


export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const reason = params.get("reason");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "signup") {
        // 세션에 있던 프로필을 가입과 함께 저장
        await api("/api/signup", { method: "POST", json: { email, password, agree, profile: loadSessionProfile() } });
      }
      const r = await signIn("credentials", { email, password, redirect: false });
      if (!r || r.error) throw new Error("이메일 또는 비밀번호가 맞지 않아요");
      router.replace(next);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const other = mode === "login" ? "/signup" : "/login";
  const qs = params.toString() ? `?${params.toString()}` : "";

  return (
    <div className="mx-auto flex max-w-[420px] flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="display text-[28px]">{mode === "login" ? "로그인" : "회원가입"}</h1>
        <p className="text-[15px] text-ink-muted">
          {reason === "save"
            ? "정책을 저장하고 마감 알림을 받으려면 로그인이 필요해요."
            : "매칭과 요약은 로그인 없이도 쓸 수 있어요. 저장·알림·체크리스트만 로그인이 필요해요."}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-semibold">이메일</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-semibold">비밀번호</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            aria-describedby={mode === "signup" ? "pw-hint" : undefined}
          />
          {mode === "signup" && <p id="pw-hint" className="text-[13px] text-ink-muted">8자 이상</p>}
        </div>

        {mode === "signup" && (
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="mb-2 text-sm font-semibold">개인정보 수집·이용 동의 (필수)</p>
            <ul className="mb-3 list-disc pl-5 text-[13px] text-ink-muted">
              <li>수집 항목: 이메일, 비밀번호(암호화 저장), 거주 시·군·구, 출생연도, 소득분위, 학적·취업 상태, 관심 분야</li>
              <li>이용 목적: 지원 정책 매칭, 관심 정책 저장, 마감 알림</li>
              <li>보관 기간: 회원 탈퇴 시 즉시 모두 삭제</li>
              <li>이름·주민등록번호·전화번호는 받지 않아요.</li>
            </ul>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-5 w-5 accent-[var(--ink)]" required />
              위 내용에 동의해요
            </label>
          </div>
        )}

        {err && <ErrorBox>{err}</ErrorBox>}

        <Button type="submit" disabled={busy || (mode === "signup" && !agree)} className="min-h-12">
          {busy ? "잠시만요…" : mode === "login" ? "로그인" : "가입하고 시작하기"}
        </Button>
      </form>

      <p className="text-center text-[15px] text-ink-muted">
        {mode === "login" ? "처음이신가요? " : "이미 계정이 있나요? "}
        <Link href={`${other}${qs}`} className="font-semibold text-ink underline underline-offset-4">
          {mode === "login" ? "회원가입" : "로그인"}
        </Link>
      </p>
    </div>
  );
}
