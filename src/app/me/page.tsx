"use client";

import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { RequireLogin } from "@/components/require-login";
import { Button, ButtonLink, Card, cx, ErrorBox } from "@/components/ui";
import { api, clearSessionProfile } from "@/lib/client";
import { regionName } from "@/lib/regions";
import type { UserProfile } from "@/lib/types";

type Settings = { d7: boolean; d3: boolean; d1: boolean; emailOn: boolean };

function Toggle({ label, desc, checked, disabled, onChange }: { label: string; desc?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cx("flex min-h-14 items-center justify-between gap-4 px-5 py-3", disabled ? "opacity-50" : "cursor-pointer")}>
      <span className="flex flex-col">
        <span className="text-[15px] font-medium">{label}</span>
        {desc && <span className="text-[13px] text-ink-muted">{desc}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
          checked ? "bg-ink" : "bg-line",
        )}
      >
        <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-surface transition-[left] duration-150", checked ? "left-6" : "left-1")} />
      </span>
    </label>
  );
}

function Account() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api<{ profile: UserProfile | null }>("/api/me/profile").then((r) => setProfile(r.profile)).catch(() => setProfile(null));
    api<{ settings: Settings }>("/api/me/notification-settings").then((r) => setSettings(r.settings)).catch((e) => setErr((e as Error).message));
  }, []);

  async function update(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await api("/api/me/notification-settings", { method: "PUT", json: next });
    } catch (e) {
      setSettings(settings);
      setErr((e as Error).message);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await api("/api/me", { method: "DELETE" });
      clearSessionProfile();
      await signOut({ redirectTo: "/" });
    } catch (e) {
      setErr((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-8 px-4 py-8">
      <div>
        <h1 className="display text-[28px]">내 정보</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{session?.user?.email}</p>
      </div>
      {err && <ErrorBox>{err}</ErrorBox>}

      <section aria-labelledby="profile-h" className="flex flex-col gap-3">
        <h2 id="profile-h" className="text-sm font-semibold text-ink-muted">매칭 프로필</h2>
        <Card className="flex flex-col gap-4 p-5">
          {profile === undefined ? (
            <div className="skeleton h-16 w-full" />
          ) : profile ? (
            <dl className="grid grid-cols-[88px_1fr] gap-y-2 text-[15px]">
              <dt className="text-ink-muted">거주지</dt><dd>{regionName(profile.regionCode)}</dd>
              <dt className="text-ink-muted">출생연도</dt><dd className="tnum">{profile.birthYear}년</dd>
              <dt className="text-ink-muted">소득분위</dt><dd>{profile.incomeLevel ? `${profile.incomeLevel}구간` : "모름"}</dd>
              <dt className="text-ink-muted">학적</dt><dd>{profile.studentStatus}</dd>
              <dt className="text-ink-muted">취업</dt><dd>{profile.employmentStatus}</dd>
              <dt className="text-ink-muted">관심 분야</dt><dd>{profile.interests.join(", ") || "전체"}</dd>
            </dl>
          ) : (
            <p className="text-[15px] text-ink-muted">아직 프로필이 없어요.</p>
          )}
          <ButtonLink href="/profile" variant="secondary" className="self-start">프로필 수정</ButtonLink>
        </Card>
      </section>

      <section aria-labelledby="noti-h" className="flex flex-col gap-3">
        <h2 id="noti-h" className="text-sm font-semibold text-ink-muted">마감 알림</h2>
        <Card className="divide-y divide-line-soft">
          {settings ? (
            <>
              <Toggle label="마감 7일 전" checked={settings.d7} onChange={(v) => update({ d7: v })} />
              <Toggle label="마감 3일 전" checked={settings.d3} onChange={(v) => update({ d3: v })} />
              <Toggle label="마감 1일 전" checked={settings.d1} onChange={(v) => update({ d1: v })} />
              <Toggle label="이메일로도 받기" desc="준비 중이에요" checked={settings.emailOn} disabled onChange={() => {}} />
            </>
          ) : (
            <div className="skeleton m-5 h-32" />
          )}
        </Card>
        <p className="text-[13px] text-ink-muted">매일 오전 9시(한국 시간)에 저장한 정책을 확인해 앱 안에서 알려 드려요.</p>
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-8">
        <Button variant="secondary" onClick={() => { clearSessionProfile(); signOut({ redirectTo: "/" }); }} className="self-start">
          <LogOut size={17} aria-hidden /> 로그아웃
        </Button>
        {!confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 self-start text-sm text-ink-muted underline underline-offset-4">
            회원 탈퇴
          </button>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl bg-urgent-bg p-5" role="alert">
            <p className="text-[15px] font-semibold text-urgent">정말 탈퇴할까요?</p>
            <p className="text-sm text-urgent">프로필, 저장한 정책, 체크리스트, 알림이 모두 바로 삭제되고 되돌릴 수 없어요.</p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={deleteAccount} disabled={deleting}>{deleting ? "삭제하는 중…" : "탈퇴하기"}</Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>취소</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function MePage() {
  return (
    <RequireLogin next="/me" title="내 정보">
      <Account />
    </RequireLogin>
  );
}
