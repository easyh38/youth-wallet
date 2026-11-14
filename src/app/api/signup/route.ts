import bcrypt from "bcryptjs";
import { z } from "zod";
import { error, json, ProfileSchema, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/security";

const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("이메일 형식을 확인해 주세요"),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 해요").max(72, "비밀번호는 72자 이하여야 해요"),
  agree: z.literal(true, { error: "개인정보 수집·이용에 동의해 주세요" }),
  profile: ProfileSchema.nullable().optional(), // 세션에 있던 프로필을 가입과 함께 저장
});

export async function POST(req: Request) {
  // 계정 대량 생성 방지: IP당 1시간 10회
  const limit = rateLimit(`signup:${clientIp(req.headers)}`, 10, 60 * 60_000);
  if (!limit.ok) return error(429, "잠시 후 다시 시도해 주세요");

  const body = await readJson(req, SignupSchema);
  if ("response" in body) return body.response;
  const { email, password, profile } = body.data;

  if (await prisma.user.findUnique({ where: { email } })) return error(409, "이미 가입한 이메일이에요");

  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        settings: { create: {} },
        ...(profile && { profile: { create: { ...profile, interests: JSON.stringify(profile.interests) } } }),
      },
      select: { id: true, email: true },
    });
    return json({ user }, 201);
  } catch {
    // 같은 이메일로 동시에 가입한 경우 (고유 제약)
    return error(409, "이미 가입한 이메일이에요");
  }
}
