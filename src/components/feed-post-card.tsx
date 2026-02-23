import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

const summaryPreviewBulletCount = 2;
const excerptPreviewCharacterCount = 220;

const buildExcerptPreview = (
  excerpt: string | null,
): {
  preview: string;
  hidden: string | null;
} => {
  const normalizedExcerpt = excerpt?.trim();

  if (!normalizedExcerpt) {
    return {
      preview: "Summary unavailable for this item.",
      hidden: null,
    };
  }

  if (normalizedExcerpt.length <= excerptPreviewCharacterCount) {
    return {
      preview: normalizedExcerpt,
      hidden: null,
    };
  }

  const boundaryIdx = normalizedExcerpt.lastIndexOf(" ", excerptPreviewCharacterCount);
  const splitIdx = boundaryIdx > excerptPreviewCharacterCount * 0.6 ? boundaryIdx : excerptPreviewCharacterCount;

  return {
    preview: `${normalizedExcerpt.slice(0, splitIdx).trimEnd()}...`,
    hidden: normalizedExcerpt.slice(splitIdx).trimStart(),
  };
};

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
  commentsCount: number;
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
  commentsCount,
}: FeedPostCardProps) => {
  const ageLabel = publishedAt
    ? formatDistanceToNow(publishedAt, {
        addSuffix: true,
      })
    : "recently added";
  const previewBullets = summaryBullets.slice(0, summaryPreviewBulletCount);
  const hiddenBullets = summaryBullets.slice(summaryPreviewBulletCount);
  const excerptPreview = buildExcerptPreview(excerpt);

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
          summaryBullets.length > 0 ? (
            <>
              <ul className="feed-summary-preview">
                {previewBullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              {hiddenBullets.length > 0 ? (
                <details className="feed-summary-more">
                  <summary className="feed-toggle-button lloyds-button-secondary">
                    <span className="feed-toggle-more">See more...</span>
                    <span className="feed-toggle-less">Show less</span>
                  </summary>
                  <ul>
                    {hiddenBullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : (
            <p>Summary unavailable for this item.</p>
          )
        ) : summaryStatus === "PENDING" ? (
          <p>Summary in progress. Check back in under a minute.</p>
        ) : excerptPreview.hidden ? (
          <>
            <p>{excerptPreview.preview}</p>
            <details className="feed-summary-more">
              <summary className="feed-toggle-button lloyds-button-secondary">
                <span className="feed-toggle-more">See more...</span>
                <span className="feed-toggle-less">Show less</span>
              </summary>
              <p>{excerptPreview.hidden}</p>
            </details>
          </>
        ) : (
          <p>{excerptPreview.preview}</p>
        )}
      </div>

      <footer className="feed-card-actions">
        <Link href={`/feed/${postId}/comments`} className="lloyds-button-secondary">
          View comments ({commentsCount})
        </Link>
      </footer>
    </article>
  );
};
