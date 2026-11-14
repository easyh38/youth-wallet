"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Button, cx, ErrorBox } from "@/components/ui";
import { api, resolveProfile, saveSessionProfile } from "@/lib/client";
import { REGIONS } from "@/lib/regions";
import {
  EMPLOYMENT_STATUSES, INTERESTS, STUDENT_STATUSES,
  type EmploymentStatus, type Interest, type StudentStatus, type UserProfile,
} from "@/lib/types";

type Draft = {
  sido: string;
  regionCode: string;
  birthYear: string;
  incomeLevel: number | null | undefined; // undefined = 아직 안 고름, null = 모름
  studentStatus: StudentStatus | null;
  employmentStatus: EmploymentStatus | null;
  interests: Interest[];
};

const EMPTY: Draft = { sido: "", regionCode: "", birthYear: "", incomeLevel: undefined, studentStatus: null, employmentStatus: null, interests: [] };
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 30 }, (_, i) => THIS_YEAR - 15 - i); // 만 14~45세 정도

const fieldCls = "min-h-12 w-full rounded-lg border border-line bg-surface px-4 text-base focus:border-ink focus:outline-2 focus:outline-ink";

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "min-h-11 rounded-full border px-4 text-[15px] font-medium transition-colors duration-150",
        selected ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:bg-paper",
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children, required }: { label: string; hint?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-[17px] font-semibold">
        {label} {required ? <span className="text-sm font-normal text-ink-muted">필수</span> : <span className="text-sm font-normal text-ink-muted">선택</span>}
      </legend>
      {hint && <p className="-mt-2 text-[13px] text-ink-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { status } = useSession();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // 이전에 입력한 프로필이 있으면 채워 둔다
  useEffect(() => {
    if (status === "loading") return;
    resolveProfile(status === "authenticated").then((p) => {
      if (!p) return;
      setD({
        sido: p.regionCode.slice(0, 2), regionCode: p.regionCode, birthYear: String(p.birthYear),
        incomeLevel: p.incomeLevel, studentStatus: p.studentStatus, employmentStatus: p.employmentStatus, interests: p.interests,
      });
    });
  }, [status]);

  const sido = REGIONS.find((r) => r.code === d.sido);
  const stepValid = [
    !!d.regionCode && !!d.birthYear,
    !!d.studentStatus && !!d.employmentStatus,
    true,
  ];
  const STEP_TITLES = ["어디에 살고, 몇 년생인가요?", "지금 어떤 상황인가요?", "조금 더 알려 주시면 정확해져요"];

  async function submit() {
    const profile: UserProfile = {
      regionCode: d.regionCode,
      birthYear: Number(d.birthYear),
      incomeLevel: d.incomeLevel ?? null,
      studentStatus: d.studentStatus!,
      employmentStatus: d.employmentStatus!,
      interests: d.interests,
    };
    setSaving(true);
    setErr("");
    try {
      saveSessionProfile(profile);
      if (status === "authenticated") await api("/api/me/profile", { method: "PUT", json: profile });
      router.push("/policies");
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 py-8">
      {/* 단계 진행 막대 */}
      <div className="mb-8 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-line-soft" role="progressbar" aria-label="입력 단계" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1}>
          <div className="h-full rounded-full bg-ink transition-[width] duration-200" style={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>
        <span className="tnum text-sm font-medium text-ink-muted">{step + 1} / 3</span>
      </div>

      <h1 className="display mb-8 text-[26px]">{STEP_TITLES[step]}</h1>

      <form
        className="flex flex-col gap-10"
        onSubmit={(e) => {
          e.preventDefault();
          if (!stepValid[step]) return;
          if (step < 2) setStep(step + 1);
          else submit();
        }}
      >
        {step === 0 && (
          <>
            <Field label="거주지" required hint="주민등록상 주소 기준으로 골라 주세요">
              <label className="sr-only" htmlFor="sido">시·도</label>
              <select id="sido" className={fieldCls} value={d.sido} onChange={(e) => setD({ ...d, sido: e.target.value, regionCode: "" })}>
                <option value="">시·도 선택</option>
                {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
              <label className="sr-only" htmlFor="sigungu">시·군·구</label>
              <select id="sigungu" className={fieldCls} value={d.regionCode} disabled={!sido} onChange={(e) => setD({ ...d, regionCode: e.target.value })}>
                <option value="">시·군·구 선택</option>
                {sido?.sigungu.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
              </select>
            </Field>
            <Field label="출생연도" required hint="나이는 자동으로 계산해요">
              <label className="sr-only" htmlFor="birth">출생연도</label>
              <select id="birth" className={fieldCls} value={d.birthYear} onChange={(e) => setD({ ...d, birthYear: e.target.value })}>
                <option value="">출생연도 선택</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}년생 (만 {THIS_YEAR - y - 1}~{THIS_YEAR - y}세)</option>)}
              </select>
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="학적 상태" required>
              <div className="flex flex-wrap gap-2">
                {STUDENT_STATUSES.map((s) => <Chip key={s} selected={d.studentStatus === s} onClick={() => setD({ ...d, studentStatus: s })}>{s}</Chip>)}
              </div>
            </Field>
            <Field label="취업 상태" required>
              <div className="flex flex-wrap gap-2">
                {EMPLOYMENT_STATUSES.map((s) => <Chip key={s} selected={d.employmentStatus === s} onClick={() => setD({ ...d, employmentStatus: s })}>{s}</Chip>)}
              </div>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="소득분위" hint="학자금 지원구간 기준이에요. 모르면 '모름'을 고르면 관련 정책을 '확인 필요'로 보여 드려요.">
              <div className="grid grid-cols-6 gap-2">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <Chip key={n} selected={d.incomeLevel === n} onClick={() => setD({ ...d, incomeLevel: n })}><span className="tnum">{n}</span></Chip>
                ))}
                <span className="col-span-2 grid">
                  <Chip selected={d.incomeLevel === null} onClick={() => setD({ ...d, incomeLevel: null })}>모름</Chip>
                </span>
              </div>
            </Field>
            <Field label="관심 분야" hint="여러 개 고를 수 있어요. 고르지 않으면 전체를 보여 드려요.">
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((s) => (
                  <Chip
                    key={s}
                    selected={d.interests.includes(s)}
                    onClick={() => setD({ ...d, interests: d.interests.includes(s) ? d.interests.filter((x) => x !== s) : [...d.interests, s] })}
                  >
                    {s}
                  </Chip>
                ))}
              </div>
            </Field>
          </>
        )}

        {err && <ErrorBox>{err}</ErrorBox>}

        <div className="flex gap-3">
          {step > 0 && (
            <Button type="button" variant="secondary" onClick={() => setStep(step - 1)} aria-label="이전 단계">
              <ChevronLeft size={18} aria-hidden /> 이전
            </Button>
          )}
          <Button type="submit" variant={step === 2 ? "accent" : "primary"} className="flex-1" disabled={!stepValid[step] || saving}>
            {step < 2 ? "다음" : saving ? "찾는 중…" : "지원금 찾기"}
          </Button>
        </div>
        <p className="text-[13px] text-ink-muted">
          {status === "authenticated"
            ? "입력한 정보는 내 계정에 저장돼요."
            : "로그인하지 않으면 이 브라우저 창을 닫을 때까지만 기억해요."}
        </p>
      </form>
    </div>
  );
}
