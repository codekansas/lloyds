import { formatDistanceToNow } from "date-fns";
import type { ArticleQualityRating } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";

import { togglePostBookmarkAction } from "@/actions/bookmark";
import { QualityRatingExplainer } from "@/components/quality-rating-explainer";
import { qualityLabelFromRating } from "@/lib/article-quality";

const summaryPreviewBulletCount = 2;
const excerptPreviewCharacterCount = 220;
const summaryBulletMaxCharacterCount = 260;

const clampText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const sanitizeDisplayText = (value: string): string => {
  return value
    .replace(/\r/g, "\n")
    .replace(/^\s*url source:.*$/gim, " ")
    .replace(/^\s*markdown content:\s*/gim, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/={2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const buildExcerptPreview = (
  excerpt: string | null,
): {
  preview: string;
  hidden: string | null;
} => {
  const normalizedExcerpt = excerpt ? sanitizeDisplayText(excerpt) : null;

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
    const cleanedBullets = summaryBullets
      .map((bullet) => clampText(sanitizeDisplayText(bullet), summaryBulletMaxCharacterCount))
      .filter((bullet) => bullet.length > 0);

    if (cleanedBullets.length === 0) {
      return {
        preview: <p>Summary unavailable for this item.</p>,
        overflow: null,
      };
    }

    const previewBullets = cleanedBullets.slice(0, summaryPreviewBulletCount);
    const hiddenBullets = cleanedBullets.slice(summaryPreviewBulletCount);

    return {
      preview: (
        <ul className="feed-summary-preview">
          {previewBullets.map((bullet, idx) => (
            <li key={`${idx}-${bullet}`}>{bullet}</li>
          ))}
        </ul>
      ),
      overflow:
        hiddenBullets.length > 0 ? (
          <ul>
            {hiddenBullets.map((bullet, idx) => (
              <li key={`${idx}-${bullet}`}>{bullet}</li>
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
  qualityModel: string | null;
  commentsCount: number;
  canBookmark: boolean;
  isBookmarked: boolean;
  bookmarkReturnTo: string;
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
  qualityModel,
  commentsCount,
  canBookmark,
  isBookmarked,
  bookmarkReturnTo,
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
  const hasCanonicalQualityScore = Boolean(qualityModel && !qualityModel.startsWith("fallback-extractive-v1"));
  const effectiveQualityRating = hasCanonicalQualityScore ? qualityRating : null;
  const effectiveQualityModel = hasCanonicalQualityScore ? qualityModel : null;
  const qualityLabel = qualityLabelFromRating(effectiveQualityRating);
  const qualityClassName = effectiveQualityRating
    ? `chip quality-pill quality-pill-${effectiveQualityRating.toLowerCase()}`
    : "chip quality-pill";
  const qualityExplanation = hasCanonicalQualityScore && qualityRationale?.trim()
    ? qualityRationale.trim()
    : "Quality reasoning summary is not available yet for this article.";

  return (
    <article className="surface feed-card" data-testid={`feed-post-${postId}`}>
      <header className="feed-card-header">
        <div className="feed-card-meta">
          <QualityRatingExplainer
            qualityLabel={qualityLabel}
            qualityClassName={qualityClassName}
            qualityExplanation={qualityExplanation}
            qualityModel={effectiveQualityModel}
          />
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
        {canBookmark ? (
          <form action={togglePostBookmarkAction}>
            <input type="hidden" name="postId" value={postId} />
            <input type="hidden" name="returnTo" value={bookmarkReturnTo} />
            <button
              type="submit"
              className={isBookmarked ? "btn btn-primary feed-bookmark-button" : "btn btn-secondary feed-bookmark-button"}
              data-bookmarked={isBookmarked}
            >
              {isBookmarked ? "Bookmarked" : "Bookmark"}
            </button>
          </form>
        ) : null}
      </footer>
    </article>
  );
};
