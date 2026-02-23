import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";

import { addPostCommentFromPostPageAction } from "@/actions/comment";
import { CommentComposer } from "@/components/comment-composer";
import { Flash } from "@/components/flash";
import { requireManifestoUser } from "@/lib/auth-guards";
import { buildCommentThreadView } from "@/lib/comment-thread";
import { prisma } from "@/lib/prisma";
import { hasSearchFlag, readSearchParam } from "@/lib/search-params";

type PostCommentsPageProps = {
  params: Promise<{
    postId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const commentErrorCopy: Record<string, string> = {
  "invalid-input": "Comment must include 2-4000 readable characters.",
  "invalid-parent": "One or more referenced parent comments were invalid.",
  "post-not-found": "Unable to find that post. Please return to the feed and try again.",
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

  const commented = hasSearchFlag(query, "commented");
  const commentError = readSearchParam(query, "commentError");
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
