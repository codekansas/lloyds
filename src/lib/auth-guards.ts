import { redirect } from "next/navigation";

import { auth } from "@/auth";

export const requireUser = async (): Promise<{
  id: string;
  email?: string | null;
  name?: string | null;
  manifestoAcceptedAt: Date | null;
}> => {
  const session = await auth();
  const user = session?.user;

  if (!user) {
    redirect("/");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    manifestoAcceptedAt: user.manifestoAcceptedAt,
  };
};

export const requireManifestoUser = async (): Promise<{
  id: string;
  email?: string | null;
  name?: string | null;
}> => {
  const user = await requireUser();

  if (!user.manifestoAcceptedAt) {
    redirect("/manifesto");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
};
