import { formatDistanceToNow } from "date-fns";
import type { ArticleQualityRating } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";

import { qualityLabelFromRating } from "@/lib/article-quality";

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

const buildSummaryContent = ({
  summaryStatus,
  summaryBullets,
  excerpt,
}: {
  summaryStatus: "PENDING" | "COMPLETE" | "FAILED";
  summaryBullets: string[];
  excerpt: string | null;
}): {
  preview: ReactNode;
  overflow: ReactNode | null;
} => {
  if (summaryStatus === "PENDING") {
    return {
      preview: <p>Summary in progress. Check back in under a minute.</p>,
      overflow: null,
    };
  }

  if (summaryStatus === "COMPLETE") {
    if (summaryBullets.length === 0) {
      return {
        preview: <p>Summary unavailable for this item.</p>,
        overflow: null,
      };
    }

    const previewBullets = summaryBullets.slice(0, summaryPreviewBulletCount);
    const hiddenBullets = summaryBullets.slice(summaryPreviewBulletCount);

    return {
      preview: (
        <ul className="feed-summary-preview">
          {previewBullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ),
      overflow:
        hiddenBullets.length > 0 ? (
          <ul>
            {hiddenBullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        ) : null,
    };
  }

  const excerptPreview = buildExcerptPreview(excerpt);

  return {
    preview: <p>{excerptPreview.preview}</p>,
    overflow: excerptPreview.hidden ? <p>{excerptPreview.hidden}</p> : null,
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
  qualityRating: ArticleQualityRating | null;
  qualityRationale: string | null;
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
  qualityRating,
  qualityRationale,
  commentsCount,
}: FeedPostCardProps) => {
  const ageLabel = publishedAt
    ? formatDistanceToNow(publishedAt, {
        addSuffix: true,
      })
    : "recently added";
  const { preview: summaryPreview, overflow: summaryOverflow } = buildSummaryContent({
    summaryStatus,
    summaryBullets,
    excerpt,
  });
  const qualityLabel = qualityLabelFromRating(qualityRating);
  const qualityClassName = qualityRating
    ? `chip quality-pill quality-pill-${qualityRating.toLowerCase()}`
    : "chip quality-pill";

  return (
    <article className="surface feed-card" data-testid={`feed-post-${postId}`}>
      <header className="feed-card-header">
        <div className="feed-card-meta">
          <span className={qualityClassName} title={qualityRationale ?? undefined}>
            {qualityLabel}
          </span>
          <span className="chip">{sourceLabel}</span>
          <span className="chip">{ageLabel}</span>
          {domain ? <span className="chip">{domain}</span> : null}
        </div>
        <h2>
          <a href={url} target="_blank" rel="noreferrer noopener">
            {title}
          </a>
        </h2>
      </header>

      <div className="feed-summary">
        <div className="feed-summary-title">
          <strong className="lloyds-label">AI brief</strong>
          {summaryReadSeconds ? <span className="lloyds-label">{summaryReadSeconds}s read</span> : null}
        </div>

        {summaryPreview}

        {summaryOverflow ? (
          <details className="feed-summary-more">
            <summary className="feed-toggle-button btn btn-secondary">
              <span className="feed-toggle-more">See more...</span>
              <span className="feed-toggle-less">Show less</span>
            </summary>
            {summaryOverflow}
          </details>
        ) : null}
      </div>

      <footer className="feed-card-actions">
        <Link href={`/feed/${postId}/comments`} className="btn btn-secondary">
          View comments ({commentsCount})
        </Link>
      </footer>
    </article>
  );
};
