"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  commentFormats,
  extractCommentReferenceNumbers,
  getCommentPlainText,
  normalizeCommentFormat,
} from "@/lib/comment-format";
import { requireManifestoUser } from "@/lib/auth-guards";
import { moderateCommentSubmission } from "@/lib/comment-moderation";
import { prisma } from "@/lib/prisma";

const minCommentCharacters = 2;
const maxCommentCharacters = 4_000;
const maxCommentParentLinks = 12;

const postCommentSchema = z.object({
  postId: z.string().cuid(),
  content: z.string().min(1).max(20_000),
  format: z.enum(commentFormats),
  parentIds: z.string().optional(),
});

const resolveCommentsPagePath = (postIdValue: unknown): string => {
  const parsedPostId = z.string().cuid().safeParse(postIdValue);
  return parsedPostId.success ? `/feed/${parsedPostId.data}/comments` : "/feed";
};

const parseParentIds = (rawParentIds: string | undefined): string[] | null => {
  if (!rawParentIds || rawParentIds.trim().length === 0) {
    return [];
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawParentIds);
  } catch {
    return null;
  }

  const parsedParentIds = z.array(z.string().cuid()).max(maxCommentParentLinks).safeParse(parsedJson);

  if (!parsedParentIds.success) {
    return null;
  }

  return [...new Set(parsedParentIds.data)];
};

const parseCommentSubmission = (
  formData: FormData,
): {
  postId: string;
  content: string;
  format: (typeof commentFormats)[number];
  parentIds: string[];
} | null => {
  const parsed = postCommentSchema.safeParse({
    postId: formData.get("postId"),
    content: formData.get("content"),
    format: formData.get("format"),
    parentIds: formData.get("parentIds"),
  });

  if (!parsed.success) {
    return null;
  }

  const normalizedFormat = normalizeCommentFormat(parsed.data.format);
  const trimmedContent = parsed.data.content.trim();

  if (!normalizedFormat) {
    return null;
  }

  const normalizedParentIds = parseParentIds(parsed.data.parentIds);

  if (!normalizedParentIds) {
    return null;
  }

  const plainText = getCommentPlainText({
    content: trimmedContent,
    format: normalizedFormat,
  });

  if (plainText.length < minCommentCharacters || plainText.length > maxCommentCharacters) {
    return null;
  }

  return {
    postId: parsed.data.postId,
    content: trimmedContent,
    format: normalizedFormat,
    parentIds: normalizedParentIds,
  };
};

const buildPathWithSearchParams = (basePath: string, params: URLSearchParams): string => {
  const queryString = params.toString();
  return queryString.length > 0 ? `${basePath}?${queryString}` : basePath;
};

const buildCommentErrorPath = ({
  basePath,
  commentError,
  suspendedUntil,
  violationCount,
}: {
  basePath: string;
  commentError: string;
  suspendedUntil?: Date | null;
  violationCount?: number | null;
}): string => {
  const params = new URLSearchParams();
  params.set("commentError", commentError);

  if (suspendedUntil) {
    params.set("commentSuspendedUntil", suspendedUntil.toISOString());
  }

  if (typeof violationCount === "number" && Number.isFinite(violationCount)) {
    params.set("violationCount", String(violationCount));
  }

  return buildPathWithSearchParams(basePath, params);
};

const createPostComment = async ({
  postId,
  content,
  format,
  userId,
  parentIds,
}: {
  postId: string;
  content: string;
  format: (typeof commentFormats)[number];
  userId: string;
  parentIds: string[];
}): Promise<
  | {
      ok: true;
      postId: string;
    }
  | {
      ok: false;
      error: "post-not-found" | "invalid-parent";
    }
> => {
  const result = await prisma.$transaction(async (transaction) => {
    const post = await transaction.post.findUnique({
      where: {
        id: postId,
      },
      select: {
        id: true,
        comments: {
          select: {
            id: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!post) {
      return {
        ok: false as const,
        error: "post-not-found" as const,
      };
    }

    const referencedCommentNumbers = extractCommentReferenceNumbers(content);
    const bodyReferencedParentIds = referencedCommentNumbers
      .map((commentNumber) => post.comments[commentNumber - 1]?.id)
      .filter((commentId): commentId is string => Boolean(commentId));
    const combinedParentIds = [...new Set([...parentIds, ...bodyReferencedParentIds])];

    if (combinedParentIds.length > maxCommentParentLinks) {
      return {
        ok: false as const,
        error: "invalid-parent" as const,
      };
    }

    if (combinedParentIds.length > 0) {
      const validParents = await transaction.postComment.findMany({
        where: {
          id: {
            in: combinedParentIds,
          },
          postId: post.id,
        },
        select: {
          id: true,
        },
      });

      if (validParents.length !== combinedParentIds.length) {
        return {
          ok: false as const,
          error: "invalid-parent" as const,
        };
      }
    }

    const createdComment = await transaction.postComment.create({
      data: {
        postId: post.id,
        authorId: userId,
        content,
        format,
      },
    });

    if (combinedParentIds.length > 0) {
      await transaction.postCommentEdge.createMany({
        data: combinedParentIds.map((parentCommentId) => ({
          childCommentId: createdComment.id,
          parentCommentId,
        })),
        skipDuplicates: true,
      });
    }

    return {
      ok: true as const,
      postId: post.id,
    };
  });

  return result;
};

export const addPostCommentAction = async (formData: FormData): Promise<void> => {
  const user = await requireManifestoUser();
  const parsed = parseCommentSubmission(formData);

  if (!parsed) {
    redirect(buildCommentErrorPath({ basePath: "/feed", commentError: "invalid-input" }));
  }

  const moderationResult = await moderateCommentSubmission({
    userId: user.id,
    postId: parsed.postId,
    content: parsed.content,
    format: parsed.format,
  });

  if (!moderationResult.ok) {
    if (moderationResult.error === "account-banned") {
      redirect("/banned");
    }

    if (moderationResult.error === "post-not-found") {
      redirect(buildCommentErrorPath({ basePath: "/feed", commentError: "post-not-found" }));
    }

    if (moderationResult.error === "comment-suspended") {
      redirect(
        buildCommentErrorPath({
          basePath: "/feed",
          commentError: "comment-suspended",
          suspendedUntil: moderationResult.suspendedUntil,
          violationCount: moderationResult.violationCount,
        }),
      );
    }

    redirect(
      buildCommentErrorPath({
        basePath: "/feed",
        commentError: "constitution-violation",
        suspendedUntil: moderationResult.suspendedUntil,
        violationCount: moderationResult.violationCount,
      }),
    );
  }

  const createResult = await createPostComment({
    postId: parsed.postId,
    content: parsed.content,
    format: parsed.format,
    userId: user.id,
    parentIds: parsed.parentIds,
  });

  if (!createResult.ok) {
    redirect(buildCommentErrorPath({ basePath: "/feed", commentError: createResult.error }));
  }

  revalidatePath("/feed");
  revalidatePath(resolveCommentsPagePath(createResult.postId));
  redirect("/feed?commented=1");
};

export const addPostCommentFromPostPageAction = async (formData: FormData): Promise<void> => {
  const user = await requireManifestoUser();
  const fallbackPath = resolveCommentsPagePath(formData.get("postId"));
  const parsed = parseCommentSubmission(formData);

  if (!parsed) {
    redirect(buildCommentErrorPath({ basePath: fallbackPath, commentError: "invalid-input" }));
  }

  const moderationResult = await moderateCommentSubmission({
    userId: user.id,
    postId: parsed.postId,
    content: parsed.content,
    format: parsed.format,
  });

  if (!moderationResult.ok) {
    if (moderationResult.error === "account-banned") {
      redirect("/banned");
    }

    if (moderationResult.error === "post-not-found") {
      redirect(buildCommentErrorPath({ basePath: fallbackPath, commentError: "post-not-found" }));
    }

    if (moderationResult.error === "comment-suspended") {
      redirect(
        buildCommentErrorPath({
          basePath: fallbackPath,
          commentError: "comment-suspended",
          suspendedUntil: moderationResult.suspendedUntil,
          violationCount: moderationResult.violationCount,
        }),
      );
    }

    redirect(
      buildCommentErrorPath({
        basePath: fallbackPath,
        commentError: "constitution-violation",
        suspendedUntil: moderationResult.suspendedUntil,
        violationCount: moderationResult.violationCount,
      }),
    );
  }

  const createResult = await createPostComment({
    postId: parsed.postId,
    content: parsed.content,
    format: parsed.format,
    userId: user.id,
    parentIds: parsed.parentIds,
  });

  if (!createResult.ok) {
    redirect(buildCommentErrorPath({ basePath: fallbackPath, commentError: createResult.error }));
  }

  revalidatePath("/feed");
  revalidatePath(resolveCommentsPagePath(createResult.postId));
  redirect(`${resolveCommentsPagePath(createResult.postId)}?commented=1`);
};
