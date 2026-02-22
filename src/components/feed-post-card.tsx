import { formatDistanceToNow } from "date-fns";

type FeedPostCardProps = {
  title: string;
  url: string;
  domain: string | null;
  publishedAt: Date | null;
  sourceLabel: string;
  summaryBullets: string[];
  summaryReadSeconds: number | null;
  summaryStatus: "PENDING" | "COMPLETE" | "FAILED";
  excerpt: string | null;
};

export const FeedPostCard = ({
  title,
  url,
  domain,
  publishedAt,
  sourceLabel,
  summaryBullets,
  summaryReadSeconds,
  summaryStatus,
  excerpt,
}: FeedPostCardProps) => {
  const ageLabel = publishedAt
    ? formatDistanceToNow(publishedAt, {
        addSuffix: true,
      })
    : "recently added";

  return (
    <article className="feed-card">
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
    </article>
  );
};
