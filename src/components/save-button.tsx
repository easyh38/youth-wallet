"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { api } from "@/lib/client";
import { cx } from "./ui";

/** ☆ 저장·해제. 비로그인이면 로그인 화면으로 보낸다 */
export function SaveButton({
  policyId, saved, onChange, size = "md",
}: { policyId: string; saved: boolean; onChange: (saved: boolean) => void; size?: "md" | "lg" }) {
  const { status } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (status !== "authenticated") {
      router.push(`/login?next=${encodeURIComponent(`/policies/${encodeURIComponent(policyId)}`)}&reason=save`);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/me/saved/${encodeURIComponent(policyId)}`, { method: saved ? "DELETE" : "POST" });
      onChange(!saved);
    } catch {
      /* 실패하면 상태를 그대로 둔다 */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "저장 해제" : "관심 정책으로 저장"}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-50",
        size === "lg" ? "h-12 w-12 border border-line bg-surface hover:bg-paper" : "-m-1.5 h-11 w-11 hover:bg-line-soft",
      )}
    >
      <Star
        size={size === "lg" ? 22 : 20}
        aria-hidden
        className={saved ? "fill-accent stroke-ink" : "stroke-ink-muted"}
        strokeWidth={saved ? 2 : 1.8}
      />
    </button>
  );
}
