import { redirect } from "next/navigation";

import { auth } from "@/auth";

export const requireUser = async (): Promise<{
  id: string;
  email?: string | null;
  name?: string | null;
  manifestoAcceptedAt: Date | null;
  commentSuspendedUntil: Date | null;
  accountBannedAt: Date | null;
  accountBanReason: string | null;
}> => {
  return requireUserWithOptions();
};

export const requireUserWithOptions = async ({
  allowBanned = false,
}: {
  allowBanned?: boolean;
} = {}): Promise<{
  id: string;
  email?: string | null;
  name?: string | null;
  manifestoAcceptedAt: Date | null;
  commentSuspendedUntil: Date | null;
  accountBannedAt: Date | null;
  accountBanReason: string | null;
}> => {
  const session = await auth();
  const user = session?.user;

  if (!user) {
    redirect("/");
  }

  if (!allowBanned && user.accountBannedAt) {
    redirect("/banned");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    manifestoAcceptedAt: user.manifestoAcceptedAt,
    commentSuspendedUntil: user.commentSuspendedUntil ?? null,
    accountBannedAt: user.accountBannedAt ?? null,
    accountBanReason: user.accountBanReason ?? null,
  };
};

export const requireManifestoUser = async (): Promise<{
  id: string;
  email?: string | null;
  name?: string | null;
}> => {
  const user = await requireUserWithOptions();

  if (!user.manifestoAcceptedAt) {
    redirect("/manifesto");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
};
