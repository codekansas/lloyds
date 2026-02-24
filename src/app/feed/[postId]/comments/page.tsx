import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";

import { addPostCommentFromPostPageAction } from "@/actions/comment";
import { CommentComposer } from "@/components/comment-composer";
import { Flash } from "@/components/flash";
import { requireManifestoUser } from "@/lib/auth-guards";
import { getCommentErrorMessage } from "@/lib/comment-feedback";
import { getCommentPermissionState } from "@/lib/comment-moderation";
import { buildCommentThreadView } from "@/lib/comment-thread";
import { constitutionGistUrl } from "@/lib/constitution";
import { prisma } from "@/lib/prisma";
import { hasSearchFlag, readSearchParam, readSearchParamNumber } from "@/lib/search-params";

type PostCommentsPageProps = {
  params: Promise<{
    postId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
    redirect("/?commentError=post-not-found");
  }

  const commentPermission = await getCommentPermissionState(viewer.id);

  const commented = hasSearchFlag(query, "commented");
  const commentError = readSearchParam(query, "commentError");
  const fallbackCommentError = commentPermission.allowed ? "" : commentPermission.reason;
  const commentErrorKey = commentError || fallbackCommentError;
  const suspendedUntilFromQuery = readSearchParam(query, "commentSuspendedUntil");
  const suspendedUntilFromPermission =
    !commentPermission.allowed && commentPermission.reason === "comment-suspended"
      ? commentPermission.suspendedUntil.toISOString()
      : "";
  const commentSuspendedUntil = suspendedUntilFromQuery || suspendedUntilFromPermission;
  const violationCountFromQuery = readSearchParamNumber(query, "violationCount");
  const violationCount = violationCountFromQuery ?? commentPermission.violationCount;
  const commentErrorMessage = getCommentErrorMessage({
    commentError: commentErrorKey,
    suspendedUntilIso: commentSuspendedUntil,
    violationCount,
  });
  const ageLabel = post.publishedAt
    ? formatDistanceToNow(post.publishedAt, {
        addSuffix: true,
      })
    : "recently added";

  const { commentNumberById, commentViewById, commentViewModels, commentReferenceOptions, userReferenceOptions } =
    buildCommentThreadView({
      comments: post.comments.map((comment) => ({
        id: comment.id,
        authorId: comment.authorId,
        authorName: comment.author?.name ?? null,
        content: comment.content,
        format: comment.format,
        createdAt: comment.createdAt,
        parentIds: comment.parentEdges.map((edge) => edge.parentCommentId),
        childIds: comment.childEdges.map((edge) => edge.childCommentId),
      })),
      viewerId: viewer.id,
      viewerName: viewer.name ?? null,
    });

  return (
    <section className="lloyds-page">
      <header className="panel feed-comments-page-header">
        <div className="feed-comments-page-meta">
          <span className="lloyds-pill">Article comments</span>
          <span className="lloyds-pill">{ageLabel}</span>
          {post.domain ? <span className="lloyds-pill">{post.domain}</span> : null}
        </div>

        <h1>{post.title}</h1>

        <div className="feed-comments-page-actions">
          <Link href="/" className="lloyds-button-secondary">
            Back to Feed
          </Link>
          <a href={post.url} target="_blank" rel="noreferrer noopener" className="lloyds-button-secondary">
            Open Article
          </a>
        </div>
      </header>

      {commented ? <Flash tone="success" message="Comment posted." /> : null}
      {commentErrorMessage ? <Flash tone="error" message={commentErrorMessage} /> : null}

      <section className="panel feed-comments-panel">
        <h2>Comment Lattice ({commentViewModels.length})</h2>
        <p className="feed-comments-tip lloyds-label">
          Comments can reference multiple parents. Use <code>&gt;&gt;number</code> or <code>!number</code> to build the DAG.
        </p>

        {commentViewModels.length === 0 ? (
          <p className="feed-comments-empty">No comments yet. Start the lattice by posting the first comment.</p>
        ) : (
          <ol className="comment-lattice">
            {commentViewModels.map((comment) => {
              return (
                <li key={comment.id} id={`comment-${comment.id}`} className="comment-lattice-item">
                  <article className="comment-card">
                    <header className="comment-card-header">
                      <a href={`#comment-${comment.id}`} className="comment-anchor lloyds-pill">
                        #{comment.number}
                      </a>
                      <span>{comment.authorLabel}</span>
                      <span>{comment.ageLabel}</span>
                    </header>

                    {comment.parentIds.length > 0 ? (
                      <div className="comment-link-row">
                        <strong className="lloyds-label">Replies to</strong>
                        {comment.parentIds.map((parentId) => {
                          const parentComment = commentViewById.get(parentId);

                          return parentComment ? (
                            <a key={parentId} href={`#comment-${parentId}`} className="comment-ref-chip lloyds-pill">
                              &gt;&gt;{parentComment.number}
                              <span className="comment-ref-tooltip">{parentComment.preview}</span>
                            </a>
                          ) : null;
                        })}
                      </div>
                    ) : null}

                    <div className="comment-body" dangerouslySetInnerHTML={{ __html: comment.renderedHtml }} />

                    {comment.childIds.length > 0 ? (
                      <div className="comment-link-row comment-link-row-backlinks">
                        <strong className="lloyds-label">Referenced by</strong>
                        {comment.childIds.map((childId) => {
                          const childNumber = commentNumberById.get(childId);
                          return childNumber ? (
                            <a key={childId} href={`#comment-${childId}`} className="comment-ref-chip lloyds-pill">
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
        {commentPermission.allowed ? (
          <form action={addPostCommentFromPostPageAction} className="feed-comment-form">
            <CommentComposer
              postId={post.id}
              commentOptions={commentReferenceOptions}
              userOptions={userReferenceOptions}
            />
          </form>
        ) : (
          <p className="feed-comments-tip">
            Commenting is currently disabled for this account. Re-read the constitution and try again after the
            suspension period.{" "}
            <a href={constitutionGistUrl} target="_blank" rel="noreferrer noopener">
              Read constitution
            </a>
            .
          </p>
        )}
      </section>
    </section>
  );
}
