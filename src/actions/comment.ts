"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireManifestoUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

const postCommentSchema = z.object({
  postId: z.string().cuid(),
  content: z.string().trim().min(2).max(1_000),
});

export const addPostCommentAction = async (formData: FormData): Promise<void> => {
  const user = await requireManifestoUser();

  const parsed = postCommentSchema.safeParse({
    postId: formData.get("postId"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    redirect("/feed?commentError=invalid-input");
  }

  const post = await prisma.post.findUnique({
    where: {
      id: parsed.data.postId,
    },
    select: {
      id: true,
    },
  });

  if (!post) {
    redirect("/feed?commentError=post-not-found");
  }

  await prisma.postComment.create({
    data: {
      postId: post.id,
      authorId: user.id,
      content: parsed.data.content,
    },
  });

  revalidatePath("/feed");
  redirect("/feed?commented=1");
};
