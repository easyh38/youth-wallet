import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "./db";
import { EMPLOYMENT_STATUSES, INTERESTS, STUDENT_STATUSES, type UserProfile } from "./types";

export const json = (data: unknown, init?: number | ResponseInit) =>
  NextResponse.json(data, typeof init === "number" ? { status: init } : init);

export const error = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** 로그인한 본인 ID. 없거나 탈퇴한 계정이면 401 응답을 돌려준다 */
export async function requireUser(): Promise<{ userId: string } | { response: NextResponse }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { response: error(401, "로그인이 필요해요") };
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) return { response: error(401, "계정을 찾을 수 없어요. 다시 로그인해 주세요") };
  return { userId };
}

const thisYear = new Date().getFullYear();

export const ProfileSchema = z.object({
  regionCode: z.string().regex(/^\d{5}$/, "시·군·구를 선택해 주세요"),
  birthYear: z.number().int().min(thisYear - 70).max(thisYear - 10),
  incomeLevel: z.number().int().min(1).max(10).nullable(),
  studentStatus: z.enum(STUDENT_STATUSES),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES),
  interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length).default([]),
}) satisfies z.ZodType<UserProfile, unknown>;

export function profileFromRow(row: {
  regionCode: string; birthYear: number; incomeLevel: number | null;
  studentStatus: string; employmentStatus: string; interests: string;
}): UserProfile {
  return ProfileSchema.parse({ ...row, interests: JSON.parse(row.interests) });
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<{ data: T } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { response: error(400, "요청 형식이 올바르지 않아요") };
  }
  const r = schema.safeParse(body);
  if (!r.success) return { response: error(400, r.error.issues[0]?.message ?? "입력값을 확인해 주세요") };
  return { data: r.data };
}
