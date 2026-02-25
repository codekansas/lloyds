const staticCommentErrorCopy: Record<string, string> = {
  "invalid-input": "Comment must include 2-4000 readable characters.",
  "invalid-parent": "One or more referenced parent comments were invalid.",
  "post-not-found": "Unable to find that post. Please refresh and try again.",
  "account-banned":
    "Your account has been banned due to repeated constitutional comment violations. Contact an administrator if this is incorrect.",
};

export const formatCommentPenaltyEndsAt = (rawValue: string): string | null => {
  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`;
};

const constitutionLinkLabel = "Re-read the constitution before posting again.";

export type CommentErrorFeedback = {
  message: string;
  constitutionLinkLabel?: string;
};

export const getCommentErrorFeedback = ({
  commentError,
  suspendedUntilIso = "",
  violationCount = null,
}: {
  commentError: string;
  suspendedUntilIso?: string;
  violationCount?: number | null;
}): CommentErrorFeedback | null => {
  if (commentError === "comment-suspended") {
    const formatted = formatCommentPenaltyEndsAt(suspendedUntilIso);

    if (formatted) {
      return {
        message: `Comment permissions are suspended until ${formatted}.`,
        constitutionLinkLabel,
      };
    }

    return {
      message: "Comment permissions are temporarily suspended.",
      constitutionLinkLabel,
    };
  }

  if (commentError === "constitution-violation") {
    const violationSuffix = violationCount ? ` (violation #${violationCount})` : "";
    const formatted = formatCommentPenaltyEndsAt(suspendedUntilIso);

    if (formatted) {
      return {
        message: `Comment blocked by constitutional moderation${violationSuffix}. Comment permissions are suspended until ${formatted}.`,
        constitutionLinkLabel,
      };
    }

    if (violationCount === 1) {
      return {
        message: `Comment blocked by constitutional moderation${violationSuffix}. This is a warning with no suspension.`,
        constitutionLinkLabel,
      };
    }

    return {
      message: `Comment blocked by constitutional moderation${violationSuffix}.`,
      constitutionLinkLabel,
    };
  }

  const staticCopy = staticCommentErrorCopy[commentError];
  if (!staticCopy) {
    return null;
  }

  return {
    message: staticCopy,
  };
};

export const getCommentErrorMessage = ({
  commentError,
  suspendedUntilIso = "",
  violationCount = null,
}: {
  commentError: string;
  suspendedUntilIso?: string;
  violationCount?: number | null;
}): string | null => {
  const feedback = getCommentErrorFeedback({
    commentError,
    suspendedUntilIso,
    violationCount,
  });

  return feedback?.message ?? null;
};
