"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client";
import { AiNotice, cx, Progress } from "./ui";

export type ChecklistItemT = { id: string; name: string; isChecked: boolean; isCustom: boolean; order: number };

export function Checklist({
  savedPolicyId, items, onChange,
}: { savedPolicyId: string; items: ChecklistItemT[]; onChange: (items: ChecklistItemT[]) => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const done = items.filter((i) => i.isChecked).length;

  async function toggle(item: ChecklistItemT) {
    const next = items.map((i) => (i.id === item.id ? { ...i, isChecked: !i.isChecked } : i));
    onChange(next); // 낙관적 업데이트
    try {
      await api("/api/me/checklist", { method: "PATCH", json: { id: item.id, isChecked: !item.isChecked } });
    } catch {
      onChange(items);
    }
  }

  async function remove(item: ChecklistItemT) {
    onChange(items.filter((i) => i.id !== item.id));
    try {
      await api(`/api/me/checklist?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    } catch {
      onChange(items);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr("");
    try {
      const { item } = await api<{ item: ChecklistItemT }>("/api/me/checklist", { method: "POST", json: { savedPolicyId, name } });
      onChange([...items, item]);
      setName("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <section aria-labelledby="checklist-h" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 id="checklist-h" className="text-[17px] font-semibold">서류 체크리스트</h3>
        <p className="tnum text-sm">
          {items.length === 0 ? (
            <span className="text-ink-muted">필요한 서류를 직접 추가해 보세요</span>
          ) : (
            <>서류 {items.length}개 중 <strong className="font-semibold">{done}개</strong> 준비 완료</>
          )}
        </p>
        {items.length > 0 && <Progress value={done} max={items.length} label="서류 준비 진행률" />}
      </div>

      <ul className="flex flex-col divide-y divide-line-soft rounded-lg border border-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-1 pr-1">
            <label className="flex min-h-12 flex-1 cursor-pointer items-center gap-3 px-4">
              <input type="checkbox" className="peer sr-only" checked={item.isChecked} onChange={() => toggle(item)} />
              <span
                aria-hidden
                className={cx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
                  item.isChecked ? "border-ok-bar bg-ok-bar text-white" : "border-line bg-surface",
                )}
              >
                {item.isChecked && <Check size={14} strokeWidth={3} />}
              </span>
              <span className={cx("text-[15px]", item.isChecked && "text-ink-muted line-through")}>{item.name}</span>
              {item.isCustom && <span className="text-xs text-ink-muted">직접 추가</span>}
            </label>
            <button
              type="button"
              onClick={() => remove(item)}
              aria-label={`${item.name} 삭제`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-line-soft hover:text-urgent"
            >
              <Trash2 size={17} aria-hidden />
            </button>
          </li>
        ))}
        <li>
          <form onSubmit={add} className="flex items-center gap-2 px-2 py-1.5">
            <label htmlFor={`add-${savedPolicyId}`} className="sr-only">서류 이름</label>
            <input
              id={`add-${savedPolicyId}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="서류 직접 추가 (예: 통장 사본)"
              className="min-h-11 flex-1 rounded-md bg-transparent px-2 text-[15px] placeholder:text-ink-muted focus:outline-2 focus:outline-ink"
            />
            <button
              type="submit"
              disabled={!name.trim()}
              aria-label="서류 추가"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-30"
            >
              <Plus size={18} aria-hidden />
            </button>
          </form>
        </li>
      </ul>
      {err && <p role="alert" className="text-sm text-urgent">{err}</p>}
      <AiNotice />
    </section>
  );
}
