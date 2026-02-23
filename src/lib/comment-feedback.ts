import { constitutionGistUrl } from "@/lib/constitution";

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

const constitutionReminder = `Re-read the constitution before posting again: ${constitutionGistUrl}`;

export const getCommentErrorMessage = ({
  commentError,
  suspendedUntilIso = "",
  violationCount = null,
}: {
  commentError: string;
  suspendedUntilIso?: string;
  violationCount?: number | null;
}): string | null => {
  if (commentError === "comment-suspended") {
    const formatted = formatCommentPenaltyEndsAt(suspendedUntilIso);

    if (formatted) {
      return `Comment permissions are suspended until ${formatted}. ${constitutionReminder}`;
    }

    return `Comment permissions are temporarily suspended. ${constitutionReminder}`;
  }

  if (commentError === "constitution-violation") {
    const violationSuffix = violationCount ? ` (violation #${violationCount})` : "";
    const formatted = formatCommentPenaltyEndsAt(suspendedUntilIso);

    if (formatted) {
      return `Comment blocked by constitutional moderation${violationSuffix}. Comment permissions are suspended until ${formatted}. ${constitutionReminder}`;
    }

    return `Comment blocked by constitutional moderation${violationSuffix}. ${constitutionReminder}`;
  }

  return staticCommentErrorCopy[commentError] ?? null;
};
