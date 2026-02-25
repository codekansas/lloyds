"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireManifestoUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

const profileSchema = z.object({
  name: z.string().max(120).optional(),
  headline: z.string().max(160).optional(),
  bio: z.string().max(4_000).optional(),
  interests: z.string().max(4_000).optional(),
  goals: z.string().max(4_000).optional(),
  ideasInFlight: z.string().max(4_000).optional(),
  notifyCommentRepliesInApp: z.enum(["on"]).optional(),
  notifyCommentRepliesEmail: z.enum(["on"]).optional(),
});

export const updateProfileAction = async (formData: FormData): Promise<void> => {
  const user = await requireManifestoUser();

  const parsed = profileSchema.safeParse({
    name: formData.get("name") || undefined,
    headline: formData.get("headline") || undefined,
    bio: formData.get("bio") || undefined,
    interests: formData.get("interests") || undefined,
    goals: formData.get("goals") || undefined,
    ideasInFlight: formData.get("ideasInFlight") || undefined,
    notifyCommentRepliesInApp: formData.get("notifyCommentRepliesInApp") || undefined,
    notifyCommentRepliesEmail: formData.get("notifyCommentRepliesEmail") || undefined,
  });

  if (!parsed.success) {
    redirect("/profile?error=invalid-input");
  }

  const data = parsed.data;

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      name: data.name?.trim() || null,
      headline: data.headline?.trim() || null,
      bio: data.bio?.trim() || null,
      interests: data.interests?.trim() || null,
      goals: data.goals?.trim() || null,
      ideasInFlight: data.ideasInFlight?.trim() || null,
      notifyCommentRepliesInApp: data.notifyCommentRepliesInApp === "on",
      notifyCommentRepliesEmail: data.notifyCommentRepliesEmail === "on",
    },
  });

  revalidatePath("/profile");
  revalidatePath("/");
  redirect("/profile?saved=1");
};
