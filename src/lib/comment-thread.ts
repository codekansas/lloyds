import { formatDistanceToNow } from "date-fns";

import { type CommentFormatValue, getCommentPlainText, renderCommentBodyHtml } from "@/lib/comment-format";

const previewCharacterLimit = 160;

type CommentThreadEntry = {
  id: string;
  authorId: string;
  authorName: string | null;
  content: string;
  format: CommentFormatValue;
  createdAt: Date;
  parentIds: string[];
  childIds: string[];
};

export type CommentViewModel = {
  id: string;
  number: number;
  authorId: string;
  authorLabel: string;
  ageLabel: string;
  renderedHtml: string;
  preview: string;
  parentIds: string[];
  childIds: string[];
};

export type CommentReferenceOption = {
  id: string;
  number: number;
  authorLabel: string;
  preview: string;
};

export type UserReferenceOption = {
  id: string;
  handle: string;
  label: string;
};

const truncatePreview = (value: string): string => {
  if (value.length <= previewCharacterLimit) {
    return value;
  }

  const boundaryIdx = value.lastIndexOf(" ", previewCharacterLimit);
  const endIdx = boundaryIdx > previewCharacterLimit * 0.6 ? boundaryIdx : previewCharacterLimit;
  return `${value.slice(0, endIdx).trimEnd()}...`;
};

const toHandle = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const createUniqueHandle = ({
  displayLabel,
  fallback,
  usedHandles,
}: {
  displayLabel: string;
  fallback: string;
  usedHandles: Set<string>;
}): string => {
  const baseHandle = toHandle(displayLabel) || `member-${fallback}`;
  let nextHandle = baseHandle;
  let suffix = 2;

  while (usedHandles.has(nextHandle)) {
    nextHandle = `${baseHandle}-${suffix}`;
    suffix += 1;
  }

  usedHandles.add(nextHandle);
  return nextHandle;
};

const uniqueKnownCommentIds = (ids: string[], commentNumberById: Map<string, number>): string[] => {
  return [...new Set(ids)].filter((commentId) => commentNumberById.has(commentId));
};

export const buildCommentThreadView = ({
  comments,
  viewerId,
  viewerName,
}: {
  comments: CommentThreadEntry[];
  viewerId: string;
  viewerName: string | null;
}): {
  commentNumberById: Map<string, number>;
  commentViewById: Map<string, CommentViewModel>;
  commentViewModels: CommentViewModel[];
  commentReferenceOptions: CommentReferenceOption[];
  userReferenceOptions: UserReferenceOption[];
} => {
  const commentNumberById = new Map(comments.map((comment, idx) => [comment.id, idx + 1]));
  const commentIdByNumber = new Map(comments.map((comment, idx) => [idx + 1, comment.id]));

  // Normalize thread references to IDs that exist in this post so rendering can
  // safely treat the comment graph as a closed DAG.
  const commentViewModels: CommentViewModel[] = comments.map((comment) => {
    const parentIds = uniqueKnownCommentIds(comment.parentIds, commentNumberById);
    const childIds = uniqueKnownCommentIds(comment.childIds, commentNumberById).sort((leftId, rightId) => {
      return (commentNumberById.get(leftId) ?? 0) - (commentNumberById.get(rightId) ?? 0);
    });

    const plainText = getCommentPlainText({
      content: comment.content,
      format: comment.format,
    });

    return {
      id: comment.id,
      number: commentNumberById.get(comment.id) ?? 0,
      authorId: comment.authorId,
      authorLabel: (comment.authorName ?? "Member").trim() || "Member",
      ageLabel: formatDistanceToNow(comment.createdAt, {
        addSuffix: true,
      }),
      renderedHtml: renderCommentBodyHtml({
        content: comment.content,
        format: comment.format,
        commentIdByNumber,
      }),
      preview: truncatePreview(plainText),
      parentIds,
      childIds,
    };
  });

  const commentViewById = new Map(commentViewModels.map((comment) => [comment.id, comment]));
  const commentReferenceOptions = commentViewModels.map((comment) => ({
    id: comment.id,
    number: comment.number,
    authorLabel: comment.authorLabel,
    preview: comment.preview,
  }));

  const participantEntries = new Map<string, string>();

  for (const comment of commentViewModels) {
    participantEntries.set(comment.authorId, comment.authorLabel);
  }

  if (!participantEntries.has(viewerId)) {
    participantEntries.set(viewerId, (viewerName ?? "You").trim() || "You");
  }

  const usedHandles = new Set<string>();
  const userReferenceOptions = [...participantEntries.entries()]
    .map(([userId, displayLabel]) => ({
      id: userId,
      label: displayLabel,
      handle: createUniqueHandle({
        displayLabel,
        fallback: userId.slice(-6),
        usedHandles,
      }),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return {
    commentNumberById,
    commentViewById,
    commentViewModels,
    commentReferenceOptions,
    userReferenceOptions,
  };
};
