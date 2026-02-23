"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth-guards";
import { manifestoTenets } from "@/lib/manifesto";
import { prisma } from "@/lib/prisma";

export const acceptManifestoAction = async (formData: FormData): Promise<void> => {
  const user = await requireUser();

  const accepted = formData.get("accept") === "on";
  if (!accepted) {
    redirect("/manifesto?error=accept-required");
  }

  for (let idx = 0; idx < manifestoTenets.length; idx += 1) {
    if (formData.get(`tenet-${idx}`) !== "on") {
      redirect("/manifesto?error=tenets-required");
    }
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      manifestoAcceptedAt: new Date(),
    },
  });

  revalidatePath("/");
  redirect("/");
};
