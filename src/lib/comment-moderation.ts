import { type CommentModerationPenalty, type CommentModerationSeverity } from "@prisma/client";
import { z } from "zod";

import { openAiClient } from "@/lib/ai";
import { type CommentFormatValue, getCommentPlainText } from "@/lib/comment-format";
import { getConstitutionText } from "@/lib/constitution";
import { env } from "@/lib/env";
import { resolvePenaltyForViolationCount } from "@/lib/comment-moderation-policy";
import { prisma } from "@/lib/prisma";

const contextCommentLimit = 14;
const contextCommentCharacterLimit = 320;
const candidateCommentCharacterLimit = 1_200;

const moderationResponseSchema = z.object({
  alignsWithConstitution: z.boolean(),
  severity: z.enum(["NONE", "MINOR", "MAJOR", "SEVERE"]),
  rationale: z.string().min(16).max(320),
  confidence: z.number().min(0).max(1),
  alignmentScore: z.number().min(0).max(1),
});

type ModerationAssessment = z.infer<typeof moderationResponseSchema> & {
  model: string;
};

export type CommentPermissionState =
  | {
      allowed: true;
      violationCount: number;
    }
  | {
      allowed: false;
      reason: "comment-suspended";
      violationCount: number;
      suspendedUntil: Date;
    }
  | {
      allowed: false;
      reason: "account-banned";
      violationCount: number;
      bannedAt: Date;
      banReason: string | null;
    };

export type CommentModerationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: "post-not-found";
    }
  | {
      ok: false;
      error: "comment-suspended";
      violationCount: number;
      suspendedUntil: Date;
    }
  | {
      ok: false;
      error: "constitution-violation";
      violationCount: number;
      suspendedUntil: Date | null;
      penalty: CommentModerationPenalty;
    }
  | {
      ok: false;
      error: "account-banned";
      violationCount: number;
      bannedAt: Date;
      banReason: string | null;
      penalty: CommentModerationPenalty;
    };

const trimForPrompt = (value: string, maxCharacters: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharacters) {
    return normalized;
  }

  return `${normalized.slice(0, maxCharacters - 3).trimEnd()}...`;
};

const extractSummaryBullets = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string").slice(0, 5);
};

const parseModerationJson = (raw: string): ModerationAssessment | null => {
  const candidates = [raw.trim()];
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fenceMatch?.[1]) {
    candidates.push(fenceMatch[1].trim());
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    candidates.push(objectMatch[0].trim());
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const parsed = moderationResponseSchema.parse(JSON.parse(candidate));
      return {
        ...parsed,
        model: env.openAiModel,
      };
    } catch {
      continue;
    }
  }

  return null;
};

export const getCommentPermissionState = async (userId: string): Promise<CommentPermissionState> => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      constitutionViolationCount: true,
      commentSuspendedUntil: true,
      accountBannedAt: true,
      accountBanReason: true,
    },
  });

  if (!user) {
    return {
      allowed: false,
      reason: "account-banned",
      violationCount: 0,
      bannedAt: new Date(),
      banReason: "User record missing.",
    };
  }

  if (user.accountBannedAt) {
    return {
      allowed: false,
      reason: "account-banned",
      violationCount: user.constitutionViolationCount,
      bannedAt: user.accountBannedAt,
      banReason: user.accountBanReason,
    };
  }

  if (user.commentSuspendedUntil && user.commentSuspendedUntil.valueOf() > Date.now()) {
    return {
      allowed: false,
      reason: "comment-suspended",
      violationCount: user.constitutionViolationCount,
      suspendedUntil: user.commentSuspendedUntil,
    };
  }

  return {
    allowed: true,
    violationCount: user.constitutionViolationCount,
  };
};

const runModerationAssessment = async ({
  postId,
  content,
  format,
}: {
  postId: string;
  content: string;
  format: CommentFormatValue;
}): Promise<
  | {
      ok: true;
      assessment: ModerationAssessment;
    }
  | {
      ok: false;
      error: "post-not-found";
    }
> => {
  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    select: {
      id: true,
      title: true,
      url: true,
      excerpt: true,
      summaryBullets: true,
      comments: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: contextCommentLimit,
        select: {
          content: true,
          format: true,
          author: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!post) {
    return {
      ok: false,
      error: "post-not-found",
    };
  }

  const candidatePlainText = trimForPrompt(
    getCommentPlainText({
      content,
      format,
    }),
    candidateCommentCharacterLimit,
  );

  const summaryBullets = extractSummaryBullets(post.summaryBullets);
  const recentComments = [...post.comments].reverse().map((comment, idx) => {
    const plainText = getCommentPlainText({
      content: comment.content,
      format: comment.format,
    });

    const authorLabel = (comment.author?.name ?? "Member").trim() || "Member";
    return `${idx + 1}. ${authorLabel}: ${trimForPrompt(plainText, contextCommentCharacterLimit)}`;
  });

  if (!openAiClient) {
    return {
      ok: true,
      assessment: {
        alignsWithConstitution: true,
        severity: "NONE",
        rationale: "Moderation model unavailable; allowed by fail-open policy.",
        confidence: 0.25,
        alignmentScore: 0.5,
        model: "fallback-allow-v1",
      },
    };
  }

  const constitution = await getConstitutionText();
  const prompt = [
    "You moderate Lloyd's Coffee House comments for constitutional alignment.",
    "Classify whether the candidate comment aligns with the constitution while considering article and thread context.",
    "Aligned comments should be technical, evidence-aware, constructive, and materially additive.",
    "Misaligned comments include politics-first hot takes, personal attacks, shallow engagement bait, spam, or off-topic content.",
    "If uncertain, prefer allowing the comment and use severity NONE or MINOR.",
    "Output strict JSON only with this exact schema:",
    '{"alignsWithConstitution": boolean, "severity": "NONE"|"MINOR"|"MAJOR"|"SEVERE", "rationale": string, "confidence": number, "alignmentScore": number}',
    "Use alignmentScore where 0 is fully misaligned and 1 is fully aligned.",
    "rationale must be one sentence under 45 words and refer to specific context.",
    "No markdown and no extra keys.",
    "--- Constitution ---",
    `Canonical URL: ${constitution.referenceUrl}`,
    `Loaded from: ${constitution.source}`,
    constitution.text,
    "--- Article Context ---",
    `Title: ${post.title}`,
    `URL: ${post.url}`,
    `Excerpt: ${trimForPrompt(post.excerpt ?? "", 420) || "Unavailable"}`,
    `Summary bullets: ${summaryBullets.length > 0 ? summaryBullets.join(" | ") : "Unavailable"}`,
    "--- Recent Thread Context ---",
    recentComments.length > 0 ? recentComments.join("\n") : "No prior comments.",
    "--- Candidate Comment ---",
    candidatePlainText,
  ].join("\n");

  try {
    const response = await openAiClient.responses.create({
      model: env.openAiModel,
      input: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
      max_output_tokens: 350,
    });
    const parsed = parseModerationJson(response.output_text);

    if (parsed) {
      return {
        ok: true,
        assessment: parsed,
      };
    }
  } catch {
    // Fall back to allow if moderation API fails.
  }

  return {
    ok: true,
    assessment: {
      alignsWithConstitution: true,
      severity: "NONE",
      rationale: "Moderation parse failed; allowed by fail-open policy.",
      confidence: 0.2,
      alignmentScore: 0.5,
      model: "fallback-allow-v1",
    },
  };
};

const logAllowedAssessment = async ({
  userId,
  postId,
  submittedContent,
  violationCount,
  assessment,
}: {
  userId: string;
  postId: string;
  submittedContent: string;
  violationCount: number;
  assessment: ModerationAssessment;
}): Promise<void> => {
  await prisma.commentModerationEvent.create({
    data: {
      userId,
      postId,
      submittedContent,
      decision: "ALLOWED",
      alignsWithConstitution: true,
      severity: assessment.severity,
      rationale: assessment.rationale,
      confidence: assessment.confidence,
      alignmentScore: assessment.alignmentScore,
      violationCountAtDecision: violationCount,
      penalty: "NONE",
      penaltyEndsAt: null,
      model: assessment.model,
    },
  });
};

const applyViolationPenalty = async ({
  userId,
  postId,
  submittedContent,
  assessment,
}: {
  userId: string;
  postId: string;
  submittedContent: string;
  assessment: ModerationAssessment;
}): Promise<Exclude<CommentModerationResult, { ok: true } | { ok: false; error: "post-not-found" }>> => {
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        constitutionViolationCount: true,
        commentSuspendedUntil: true,
        accountBannedAt: true,
        accountBanReason: true,
      },
    });

    if (!user || user.accountBannedAt) {
      return {
        ok: false as const,
        error: "account-banned" as const,
        violationCount: user?.constitutionViolationCount ?? 0,
        bannedAt: user?.accountBannedAt ?? now,
        banReason: user?.accountBanReason ?? "Account disabled by moderation policy.",
        penalty: "BAN_ACCOUNT" as const,
      };
    }

    if (user.commentSuspendedUntil && user.commentSuspendedUntil.valueOf() > now.valueOf()) {
      return {
        ok: false as const,
        error: "comment-suspended" as const,
        violationCount: user.constitutionViolationCount,
        suspendedUntil: user.commentSuspendedUntil,
      };
    }

    const nextViolationCount = user.constitutionViolationCount + 1;
    const penaltyResolution = resolvePenaltyForViolationCount(nextViolationCount);
    const penaltyEndsAt =
      penaltyResolution.suspensionHours === null
        ? null
        : new Date(now.valueOf() + penaltyResolution.suspensionHours * 60 * 60 * 1_000);

    await transaction.user.update({
      where: {
        id: userId,
      },
      data: {
        constitutionViolationCount: nextViolationCount,
        commentSuspendedUntil: penaltyResolution.penalty === "BAN_ACCOUNT" ? null : penaltyEndsAt,
        accountBannedAt: penaltyResolution.penalty === "BAN_ACCOUNT" ? now : null,
        accountBanReason:
          penaltyResolution.penalty === "BAN_ACCOUNT"
            ? "Repeated constitutional violations in comment moderation."
            : null,
      },
    });

    await transaction.commentModerationEvent.create({
      data: {
        userId,
        postId,
        submittedContent,
        decision: "BLOCKED",
        alignsWithConstitution: false,
        severity: assessment.severity as CommentModerationSeverity,
        rationale: assessment.rationale,
        confidence: assessment.confidence,
        alignmentScore: assessment.alignmentScore,
        violationCountAtDecision: nextViolationCount,
        penalty: penaltyResolution.penalty,
        penaltyEndsAt,
        model: assessment.model,
      },
    });

    if (penaltyResolution.penalty === "BAN_ACCOUNT") {
      return {
        ok: false as const,
        error: "account-banned" as const,
        violationCount: nextViolationCount,
        bannedAt: now,
        banReason: "Repeated constitutional violations in comment moderation.",
        penalty: penaltyResolution.penalty,
      };
    }

    return {
      ok: false as const,
      error: "constitution-violation" as const,
      violationCount: nextViolationCount,
      suspendedUntil: penaltyEndsAt,
      penalty: penaltyResolution.penalty,
    };
  });
};

export const moderateCommentSubmission = async ({
  userId,
  postId,
  content,
  format,
}: {
  userId: string;
  postId: string;
  content: string;
  format: CommentFormatValue;
}): Promise<CommentModerationResult> => {
  const permission = await getCommentPermissionState(userId);

  if (!permission.allowed) {
    if (permission.reason === "account-banned") {
      return {
        ok: false,
        error: "account-banned",
        violationCount: permission.violationCount,
        bannedAt: permission.bannedAt,
        banReason: permission.banReason,
        penalty: "BAN_ACCOUNT",
      };
    }

    return {
      ok: false,
      error: "comment-suspended",
      violationCount: permission.violationCount,
      suspendedUntil: permission.suspendedUntil,
    };
  }

  const moderation = await runModerationAssessment({
    postId,
    content,
    format,
  });

  if (!moderation.ok) {
    return {
      ok: false,
      error: "post-not-found",
    };
  }

  const submittedPlainText = getCommentPlainText({
    content,
    format,
  });

  if (moderation.assessment.alignsWithConstitution) {
    await logAllowedAssessment({
      userId,
      postId,
      submittedContent: submittedPlainText,
      violationCount: permission.violationCount,
      assessment: moderation.assessment,
    });

    return {
      ok: true,
    };
  }

  return applyViolationPenalty({
    userId,
    postId,
    submittedContent: submittedPlainText,
    assessment: moderation.assessment,
  });
};
