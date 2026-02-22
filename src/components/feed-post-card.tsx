import { formatDistanceToNow } from "date-fns";

type FeedPostCardProps = {
  postId: string;
  title: string;
  url: string;
  domain: string | null;
  publishedAt: Date | null;
  sourceLabel: string;
  summaryBullets: string[];
  summaryReadSeconds: number | null;
  summaryStatus: "PENDING" | "COMPLETE" | "FAILED";
  excerpt: string | null;
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    authorName: string | null;
  }>;
  onCommentSubmit: (formData: FormData) => Promise<void>;
};

export const FeedPostCard = ({
  postId,
  title,
  url,
  domain,
  publishedAt,
  sourceLabel,
  summaryBullets,
  summaryReadSeconds,
  summaryStatus,
  excerpt,
  comments,
  onCommentSubmit,
}: FeedPostCardProps) => {
  const ageLabel = publishedAt
    ? formatDistanceToNow(publishedAt, {
        addSuffix: true,
      })
    : "recently added";

  return (
    <article className="feed-card" data-testid={`feed-post-${postId}`}>
      <header className="feed-card-header">
        <div className="feed-card-meta">
          <span>{sourceLabel}</span>
          <span>{ageLabel}</span>
          {domain ? <span>{domain}</span> : null}
        </div>
        <h2>
          <a href={url} target="_blank" rel="noreferrer noopener">
            {title}
          </a>
        </h2>
      </header>

      <div className="feed-summary">
        <div className="feed-summary-title">
          <strong>AI brief</strong>
          {summaryReadSeconds ? <span>{summaryReadSeconds}s read</span> : null}
        </div>

        {summaryStatus === "COMPLETE" ? (
          <ul>
            {summaryBullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        ) : summaryStatus === "PENDING" ? (
          <p>Summary in progress. Check back in under a minute.</p>
        ) : (
          <p>{excerpt || "Summary unavailable for this item."}</p>
        )}
      </div>

      <section className="feed-comments">
        <h3 className="feed-comments-title">Comments ({comments.length})</h3>
        {comments.length === 0 ? (
          <p className="feed-comments-empty">No comments yet. Add context or a key question for readers.</p>
        ) : (
          <ul className="feed-comments-list">
            {comments.map((comment) => (
              <li key={comment.id}>
                <p>{comment.content}</p>
                <span>
                  {(comment.authorName ?? "Member").trim()} ·{" "}
                  {formatDistanceToNow(comment.createdAt, {
                    addSuffix: true,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form action={onCommentSubmit} className="feed-comment-form">
          <input type="hidden" name="postId" value={postId} />
          <label htmlFor={`comment-${postId}`}>
            Add Comment
            <textarea
              id={`comment-${postId}`}
              name="content"
              maxLength={1_000}
              minLength={2}
              placeholder="Add a thoughtful comment about this piece."
              required
            />
          </label>
          <button type="submit" className="lloyds-button-secondary">
            Post Comment
          </button>
        </form>
      </section>
    </article>
  );
};
