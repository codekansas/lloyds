import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      manifestoAcceptedAt: Date | null;
    } & DefaultSession["user"];
  }

  interface User {
    manifestoAcceptedAt?: Date | null;
  }
}
