"use client";

import type { UserProfile } from "./types";

const KEY = "cj.profile";

/** 비로그인 상태에서는 브라우저 세션에만 저장한다 (PRD 6-1) */
export function loadSessionProfile(): UserProfile | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function saveSessionProfile(p: UserProfile) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 사생활 보호 모드 등 */
  }
}

export function clearSessionProfile() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined && { "Content-Type": "application/json" }), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "잠시 후 다시 시도해 주세요");
  return data as T;
}

/** 로그인 상태면 서버 프로필, 아니면 세션 프로필 */
export async function resolveProfile(loggedIn: boolean): Promise<UserProfile | null> {
  if (loggedIn) {
    try {
      const { profile } = await api<{ profile: UserProfile | null }>("/api/me/profile");
      if (profile) {
        saveSessionProfile(profile);
        return profile;
      }
    } catch {}
  }
  return loadSessionProfile();
}
