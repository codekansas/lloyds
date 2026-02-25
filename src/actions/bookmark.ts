"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireManifestoUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

const toggleBookmarkSchema = z.object({
  postId: z.string().cuid(),
  returnTo: z.string().optional(),
});

const resolveReturnPath = (rawValue: string | undefined): string => {
  if (!rawValue || !rawValue.startsWith("/") || rawValue.startsWith("//")) {
    return "/";
  }

  return rawValue;
};

const setSearchFlag = (path: string, key: string, value: string): string => {
  const [pathname, rawSearch = ""] = path.split("?", 2);
  const searchParams = new URLSearchParams(rawSearch);
  searchParams.set(key, value);
  const query = searchParams.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
};

export const togglePostBookmarkAction = async (formData: FormData): Promise<void> => {
  const user = await requireManifestoUser();

  const parsed = toggleBookmarkSchema.safeParse({
    postId: formData.get("postId"),
    returnTo: formData.get("returnTo") || undefined,
  });

  if (!parsed.success) {
    redirect("/?bookmark=invalid");
  }

  const returnPath = resolveReturnPath(parsed.data.returnTo);
  const toggleResult = await prisma.$transaction(async (transaction) => {
    const existingBookmark = await transaction.postBookmark.findUnique({
      where: {
        userId_postId: {
          userId: user.id,
          postId: parsed.data.postId,
        },
      },
      select: {
        postId: true,
      },
    });

    if (existingBookmark) {
      await transaction.postBookmark.delete({
        where: {
          userId_postId: {
            userId: user.id,
            postId: parsed.data.postId,
          },
        },
      });

      return {
        ok: true as const,
        state: "removed" as const,
      };
    }

    const post = await transaction.post.findUnique({
      where: {
        id: parsed.data.postId,
      },
      select: {
        id: true,
      },
    });

    if (!post) {
      return {
        ok: false as const,
      };
    }

    await transaction.postBookmark.create({
      data: {
        userId: user.id,
        postId: post.id,
      },
    });

    return {
      ok: true as const,
      state: "saved" as const,
    };
  });

  if (!toggleResult.ok) {
    redirect(setSearchFlag(returnPath, "bookmark", "post-not-found"));
  }

  revalidatePath("/");
  revalidatePath("/profile");
  redirect(setSearchFlag(returnPath, "bookmark", toggleResult.state));
};
