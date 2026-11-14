import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/security";

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(72) });

// 없는 계정이어도 같은 시간만큼 bcrypt 비교를 해서, 응답 시간으로 가입 여부를 알 수 없게 한다
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-password", 10);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = LoginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // 무차별 대입 방지: 계정별 15분 10회, IP별 15분 30회
        const ip = clientIp(request.headers);
        if (!rateLimit(`login:email:${email}`, 10, 15 * 60_000).ok || !rateLimit(`login:ip:${ip}`, 30, 15 * 60_000).ok) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        return user && ok ? { id: user.id, email: user.email } : null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
});
