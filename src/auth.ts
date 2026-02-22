import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
  },
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  providers: [
    GitHub({
      clientId: env.githubClientId ?? "",
      clientSecret: env.githubClientSecret ?? "",
    }),
    Google({
      clientId: env.googleClientId ?? "",
      clientSecret: env.googleClientSecret ?? "",
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    session: async ({ session, user }) => {
      if (session.user) {
        session.user.id = user.id;
        session.user.manifestoAcceptedAt = user.manifestoAcceptedAt ?? null;
      }

      return session;
    },
  },
});
