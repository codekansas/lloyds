"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireManifestoUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

export const markReplyNotificationsReadAction = async (): Promise<void> => {
  const user = await requireManifestoUser();

  await prisma.commentReplyNotification.updateMany({
    where: {
      recipientUserId: user.id,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });

  revalidatePath("/profile");
  redirect("/profile?notificationsRead=1");
};
