import type { CommentFormatValue } from "@/lib/comment-format";

import { getCommentPlainText } from "@/lib/comment-format";
import { env } from "@/lib/env";
import { getErrorDiagnostics, logEvent } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

const emailCooldownMs = 45 * 60 * 1000;
const emailRequestTimeoutMs = 8_000;
const replyPreviewMaxLength = 240;

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const toEmailSafeText = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const buildCommentReplyPath = ({ postId, commentId }: { postId: string; commentId: string }): string => {
  return `/feed/${postId}/comments#comment-${commentId}`;
};

const buildAbsoluteUrl = (path: string): string | null => {
  const baseUrl = env.appBaseUrl;
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return null;
  }
};

const sendCommentReplyEmail = async ({
  recipientEmail,
  recipientName,
  actorName,
  postTitle,
  postUrl,
  replyPreview,
}: {
  recipientEmail: string;
  recipientName: string | null;
  actorName: string;
  postTitle: string;
  postUrl: string;
  replyPreview: string;
}): Promise<boolean> => {
  if (!env.resendApiKey || !env.notificationEmailFrom) {
    return false;
  }

  const safeActorName = truncate(toEmailSafeText(actorName), 80) || "Another member";
  const safePostTitle = truncate(toEmailSafeText(postTitle), 140) || "an article";
  const safeReplyPreview = truncate(toEmailSafeText(replyPreview), replyPreviewMaxLength) || "Reply preview unavailable.";
  const safeGreeting = toEmailSafeText(recipientName ?? "");
  const greeting = safeGreeting.length > 0 ? `Hi ${safeGreeting},` : "Hi,";
  const subject = `${safeActorName} replied to your comment on "${truncate(safePostTitle, 84)}"`;
  const textBody = [
    greeting,
    "",
    `${safeActorName} replied to one of your comments in Lloyd's Coffee House.`,
    `Article: ${safePostTitle}`,
    `Reply preview: ${safeReplyPreview}`,
    "",
    `Open discussion: ${postUrl}`,
    "",
    "You can adjust reply notification preferences in your profile.",
  ].join("\n");

  const htmlBody = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p><strong>${escapeHtml(safeActorName)}</strong> replied to one of your comments in Lloyd's Coffee House.</p>`,
    `<p><strong>Article:</strong> ${escapeHtml(safePostTitle)}</p>`,
    `<p><strong>Reply preview:</strong> ${escapeHtml(safeReplyPreview)}</p>`,
    `<p><a href="${escapeHtml(postUrl)}">Open discussion</a></p>`,
    "<p>You can adjust reply notification preferences in your profile.</p>",
  ].join("");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.notificationEmailFrom,
        to: [recipientEmail],
        subject,
        text: textBody,
        html: htmlBody,
      }),
      signal: AbortSignal.timeout(emailRequestTimeoutMs),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      logEvent("warn", "notifications.reply.email_send_failed", {
        status: response.status,
        responseBody: truncate(toEmailSafeText(responseBody), 240),
      });
      return false;
    }

    return true;
  } catch (error: unknown) {
    logEvent("warn", "notifications.reply.email_send_error", {
      error: getErrorDiagnostics(error),
    });
    return false;
  }
};

export const dispatchCommentReplyNotifications = async ({
  actorUserId,
  postId,
  commentId,
  parentCommentIds,
  commentContent,
  commentFormat,
}: {
  actorUserId: string;
  postId: string;
  commentId: string;
  parentCommentIds: string[];
  commentContent: string;
  commentFormat: CommentFormatValue;
}): Promise<void> => {
  const dedupedParentCommentIds = [...new Set(parentCommentIds)];
  if (dedupedParentCommentIds.length === 0) {
    return;
  }

  try {
    const [actor, post, parentComments] = await Promise.all([
      prisma.user.findUnique({
        where: {
          id: actorUserId,
        },
        select: {
          name: true,
        },
      }),
      prisma.post.findUnique({
        where: {
          id: postId,
        },
        select: {
          title: true,
        },
      }),
      prisma.postComment.findMany({
        where: {
          id: {
            in: dedupedParentCommentIds,
          },
          postId,
        },
        select: {
          authorId: true,
        },
      }),
    ]);

    const recipientIds = [...new Set(parentComments.map((comment) => comment.authorId))].filter((userId) => userId !== actorUserId);
    if (recipientIds.length === 0) {
      return;
    }

    const recipients = await prisma.user.findMany({
      where: {
        id: {
          in: recipientIds,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        accountBannedAt: true,
        notifyCommentRepliesInApp: true,
        notifyCommentRepliesEmail: true,
        lastReplyEmailSentAt: true,
      },
    });

    const optedRecipients = recipients.filter(
      (recipient) =>
        !recipient.accountBannedAt &&
        (recipient.notifyCommentRepliesInApp || recipient.notifyCommentRepliesEmail),
    );

    if (optedRecipients.length === 0) {
      return;
    }

    logEvent("info", "notifications.reply.recipients_resolved", {
      actorUserId,
      postId,
      commentId,
      parentCommentCount: dedupedParentCommentIds.length,
      recipientCount: optedRecipients.length,
      inAppRecipientCount: optedRecipients.filter((recipient) => recipient.notifyCommentRepliesInApp).length,
      emailRecipientCount: optedRecipients.filter((recipient) => recipient.notifyCommentRepliesEmail).length,
    });

    await prisma.commentReplyNotification.createMany({
      data: optedRecipients.map((recipient) => ({
        recipientUserId: recipient.id,
        actorUserId,
        postId,
        commentId,
      })),
      skipDuplicates: true,
    });

    const notifications = await prisma.commentReplyNotification.findMany({
      where: {
        commentId,
        recipientUserId: {
          in: optedRecipients.map((recipient) => recipient.id),
        },
      },
      select: {
        id: true,
        recipientUserId: true,
        emailedAt: true,
      },
    });

    const notificationByRecipientId = new Map(notifications.map((notification) => [notification.recipientUserId, notification]));
    const actorName = (actor?.name ?? "Another member").trim() || "Another member";
    const postTitle = post?.title?.trim() || "an article";
    const commentPreview = truncate(
      toEmailSafeText(
        getCommentPlainText({
          content: commentContent,
          format: commentFormat,
        }),
      ),
      replyPreviewMaxLength,
    );
    const commentPath = buildCommentReplyPath({
      postId,
      commentId,
    });
    const commentUrl = buildAbsoluteUrl(commentPath);
    const hasEmailConfig = Boolean(env.resendApiKey && env.notificationEmailFrom);

    if (!hasEmailConfig && optedRecipients.some((recipient) => recipient.notifyCommentRepliesEmail)) {
      logEvent("warn", "notifications.reply.email_not_configured", {
        actorUserId,
        postId,
        commentId,
      });
    }

    for (const recipient of optedRecipients) {
      if (!recipient.notifyCommentRepliesEmail || !recipient.email || !commentUrl) {
        continue;
      }

      const notification = notificationByRecipientId.get(recipient.id);
      if (!notification || notification.emailedAt) {
        continue;
      }

      if (recipient.lastReplyEmailSentAt && Date.now() - recipient.lastReplyEmailSentAt.valueOf() < emailCooldownMs) {
        logEvent("info", "notifications.reply.email_cooldown_skip", {
          recipientUserId: recipient.id,
          actorUserId,
          postId,
          commentId,
        });
        continue;
      }

      const sent = await sendCommentReplyEmail({
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        actorName,
        postTitle,
        postUrl: commentUrl,
        replyPreview: commentPreview,
      });

      if (!sent) {
        continue;
      }

      const now = new Date();
      await prisma.$transaction([
        prisma.commentReplyNotification.updateMany({
          where: {
            id: notification.id,
            emailedAt: null,
          },
          data: {
            emailedAt: now,
          },
        }),
        prisma.user.update({
          where: {
            id: recipient.id,
          },
          data: {
            lastReplyEmailSentAt: now,
          },
        }),
      ]);

      logEvent("info", "notifications.reply.email_sent", {
        recipientUserId: recipient.id,
        actorUserId,
        postId,
        commentId,
      });
    }
  } catch (error: unknown) {
    logEvent("warn", "notifications.reply.dispatch_failed", {
      actorUserId,
      postId,
      commentId,
      parentCommentCount: dedupedParentCommentIds.length,
      error: getErrorDiagnostics(error),
    });
  }
};
