import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const providers = [];

if (env.githubClientId && env.githubClientSecret) {
  providers.push(
    GitHub({
      clientId: env.githubClientId,
      clientSecret: env.githubClientSecret,
    }),
  );
}

if (env.googleClientId && env.googleClientSecret) {
  providers.push(
    Google({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
  },
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  providers,
  callbacks: {
    session: async ({ session, user }) => {
      if (session.user) {
        session.user.id = user.id;
        session.user.manifestoAcceptedAt = user.manifestoAcceptedAt ?? null;
        session.user.commentSuspendedUntil = user.commentSuspendedUntil ?? null;
        session.user.accountBannedAt = user.accountBannedAt ?? null;
        session.user.accountBanReason = user.accountBanReason ?? null;
      }

      return session;
    },
  },
});
