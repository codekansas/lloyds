import type { CSSProperties } from "react";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";

import { addPostCommentFromPostPageAction } from "@/actions/comment";
import { CommentComposer } from "@/components/comment-composer";
import { Flash } from "@/components/flash";
import { getCommentPlainText, renderCommentBodyHtml } from "@/lib/comment-format";
import { requireManifestoUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

type PostCommentsPageProps = {
  params: Promise<{
    postId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CommentViewModel = {
  id: string;
  number: number;
  authorId: string;
  authorLabel: string;
  ageLabel: string;
  renderedHtml: string;
  preview: string;
  parentIds: string[];
  childIds: string[];
  depth: number;
};

const commentErrorCopy: Record<string, string> = {
  "invalid-input": "Comment must include 2-4000 readable characters.",
  "invalid-parent": "One or more referenced parent comments were invalid.",
  "post-not-found": "Unable to find that post. Please return to the feed and try again.",
};

const maxDisplayDepth = 8;
const previewCharacterLimit = 160;

const toHandle = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const truncate = (value: string): string => {
  if (value.length <= previewCharacterLimit) {
    return value;
  }

  const boundaryIdx = value.lastIndexOf(" ", previewCharacterLimit);
  const endIdx = boundaryIdx > previewCharacterLimit * 0.6 ? boundaryIdx : previewCharacterLimit;
  return `${value.slice(0, endIdx).trimEnd()}...`;
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

export default async function PostCommentsPage({ params, searchParams }: PostCommentsPageProps) {
  const viewer = await requireManifestoUser();
  const [{ postId }, query] = await Promise.all([params, searchParams]);
  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    select: {
      id: true,
      title: true,
      url: true,
      domain: true,
      publishedAt: true,
      comments: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          authorId: true,
          content: true,
          format: true,
          createdAt: true,
          author: {
            select: {
              name: true,
            },
          },
          parentEdges: {
            select: {
              parentCommentId: true,
            },
          },
          childEdges: {
            select: {
              childCommentId: true,
            },
          },
        },
      },
    },
  });

  if (!post) {
    redirect("/feed?commentError=post-not-found");
  }

  const commented = query.commented === "1";
  const commentError = typeof query.commentError === "string" ? query.commentError : "";
  const ageLabel = post.publishedAt
    ? formatDistanceToNow(post.publishedAt, {
        addSuffix: true,
      })
    : "recently added";

  const commentNumberById = new Map(post.comments.map((comment, idx) => [comment.id, idx + 1]));
  const depthByCommentId = new Map<string, number>();
  const commentViewModels: CommentViewModel[] = post.comments.map((comment) => {
    const parentIds = [...new Set(comment.parentEdges.map((edge) => edge.parentCommentId))].filter((parentId) =>
      commentNumberById.has(parentId),
    );
    const childIds = [...new Set(comment.childEdges.map((edge) => edge.childCommentId))]
      .filter((childId) => commentNumberById.has(childId))
      .sort((leftId, rightId) => {
        return (commentNumberById.get(leftId) ?? 0) - (commentNumberById.get(rightId) ?? 0);
      });
    const parentDepths = parentIds.map((parentId) => depthByCommentId.get(parentId) ?? 0);
    const depth = parentDepths.length > 0 ? Math.min(Math.max(...parentDepths) + 1, maxDisplayDepth) : 0;

    depthByCommentId.set(comment.id, depth);

    const plainText = getCommentPlainText({
      content: comment.content,
      format: comment.format,
    });

    return {
      id: comment.id,
      number: commentNumberById.get(comment.id) ?? 0,
      authorId: comment.authorId,
      authorLabel: (comment.author.name ?? "Member").trim() || "Member",
      ageLabel: formatDistanceToNow(comment.createdAt, {
        addSuffix: true,
      }),
      renderedHtml: renderCommentBodyHtml({
        content: comment.content,
        format: comment.format,
      }),
      preview: truncate(plainText),
      parentIds,
      childIds,
      depth,
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

  if (!participantEntries.has(viewer.id)) {
    participantEntries.set(viewer.id, (viewer.name ?? "You").trim() || "You");
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

  return (
    <section className="lloyds-page">
      <header className="panel feed-comments-page-header">
        <div className="feed-comments-page-meta">
          <span>Article comments</span>
          <span>{ageLabel}</span>
          {post.domain ? <span>{post.domain}</span> : null}
        </div>

        <h1>{post.title}</h1>

        <div className="feed-comments-page-actions">
          <Link href="/feed" className="lloyds-button-secondary">
            Back to Feed
          </Link>
          <a href={post.url} target="_blank" rel="noreferrer noopener" className="lloyds-button-secondary">
            Open Article
          </a>
        </div>
      </header>

      {commented ? <Flash tone="success" message="Comment posted." /> : null}
      {commentErrorCopy[commentError] ? <Flash tone="error" message={commentErrorCopy[commentError]} /> : null}

      <section className="panel feed-comments-panel">
        <h2>Comment Lattice ({commentViewModels.length})</h2>
        <p className="feed-comments-tip">
          Comments can reference multiple parents. Use <code>&gt;&gt;number</code> to build the DAG.
        </p>

        {commentViewModels.length === 0 ? (
          <p className="feed-comments-empty">No comments yet. Start the lattice by posting the first comment.</p>
        ) : (
          <ol className="comment-lattice">
            {commentViewModels.map((comment) => {
              const parentPreviewItems = comment.parentIds
                .map((parentId) => commentViewById.get(parentId))
                .filter((parentComment): parentComment is CommentViewModel => Boolean(parentComment));
              const style = {
                "--comment-depth": comment.depth,
              } as CSSProperties;

              return (
                <li key={comment.id} id={`comment-${comment.id}`} className="comment-lattice-item" style={style}>
                  <article className="comment-card">
                    <header className="comment-card-header">
                      <a href={`#comment-${comment.id}`} className="comment-anchor">
                        #{comment.number}
                      </a>
                      <span>{comment.authorLabel}</span>
                      <span>{comment.ageLabel}</span>
                    </header>

                    {comment.parentIds.length > 0 ? (
                      <div className="comment-link-row">
                        <strong>Replies to</strong>
                        {comment.parentIds.map((parentId) => {
                          const parentNumber = commentNumberById.get(parentId);
                          return parentNumber ? (
                            <a key={parentId} href={`#comment-${parentId}`} className="comment-ref-chip">
                              &gt;&gt;{parentNumber}
                            </a>
                          ) : null;
                        })}
                      </div>
                    ) : null}

                    {parentPreviewItems.length > 0 ? (
                      <ul className="comment-parent-previews">
                        {parentPreviewItems.map((parentComment) => (
                          <li key={parentComment.id}>
                            <a href={`#comment-${parentComment.id}`}>&gt;&gt;{parentComment.number}</a>
                            <p>{parentComment.preview}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="comment-body" dangerouslySetInnerHTML={{ __html: comment.renderedHtml }} />

                    {comment.childIds.length > 0 ? (
                      <div className="comment-link-row comment-link-row-backlinks">
                        <strong>Referenced by</strong>
                        {comment.childIds.map((childId) => {
                          const childNumber = commentNumberById.get(childId);
                          return childNumber ? (
                            <a key={childId} href={`#comment-${childId}`} className="comment-ref-chip">
                              &gt;&gt;{childNumber}
                            </a>
                          ) : null;
                        })}
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="panel feed-comments-compose-panel">
        <h2>Write a Comment</h2>
        <form action={addPostCommentFromPostPageAction} className="feed-comment-form">
          <CommentComposer
            postId={post.id}
            commentOptions={commentReferenceOptions}
            userOptions={userReferenceOptions}
          />
        </form>
      </section>
    </section>
  );
}
