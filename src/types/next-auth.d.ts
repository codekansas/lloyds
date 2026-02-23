import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      manifestoAcceptedAt: Date | null;
      commentSuspendedUntil: Date | null;
      accountBannedAt: Date | null;
      accountBanReason: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    manifestoAcceptedAt?: Date | null;
    commentSuspendedUntil?: Date | null;
    accountBannedAt?: Date | null;
    accountBanReason?: string | null;
  }
}
