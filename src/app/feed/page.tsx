import type { Prisma } from "@prisma/client";
import Link from "next/link";

import { Flash } from "@/components/flash";
import { FeedPostCard } from "@/components/feed-post-card";
import { requireManifestoUser } from "@/lib/auth-guards";
import { constitutionGistUrl } from "@/lib/constitution";
import { getRankedFeedPosts, maxFeedDayOffset } from "@/lib/feed";
import { prisma } from "@/lib/prisma";
import { hasSearchFlag, readSearchParam } from "@/lib/search-params";
import { ensureCuratedFeedSources } from "@/lib/seed-curated";

type FeedPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const commentErrorCopy: Record<string, string> = {
  "invalid-input": "Comment must include 2-4000 readable characters.",
  "invalid-parent": "One or more referenced parent comments were invalid.",
  "post-not-found": "Unable to find that post. Please refresh and try again.",
};

const parseBullets = (value: Prisma.JsonValue | null): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
};

const dayMs = 24 * 60 * 60 * 1000;
const dayOptionsCount = 4;
const feedPageSize = 10;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

type FeedWindowMode = "rolling-24h" | "all-time";

const clampDayOffset = (rawValue: string | string[] | undefined): number => {
  if (typeof rawValue !== "string") {
    return 0;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(maxFeedDayOffset, parsed));
};

const clampPage = (rawValue: string | string[] | undefined): number => {
  if (typeof rawValue !== "string") {
    return 1;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, parsed);
};

const buildWindowLabel = (dayOffset: number, now: Date): string => {
  if (dayOffset === 0) {
    return "Last 24 hours";
  }

  const end = new Date(now.valueOf() - dayOffset * dayMs);
  const start = new Date(end.valueOf() - dayMs);
  const inclusiveEnd = new Date(end.valueOf() - 1_000);

  return `${dateFormatter.format(start)} - ${dateFormatter.format(inclusiveEnd)}`;
};

const buildFeedHref = ({
  windowMode,
  dayOffset,
  page,
}: {
  windowMode: FeedWindowMode;
  dayOffset: number;
  page: number;
}): string => {
  const params = new URLSearchParams();

  if (windowMode === "all-time") {
    params.set("window", "all");
  } else if (dayOffset > 0) {
    params.set("dayOffset", String(dayOffset));
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();
  return queryString.length > 0 ? `/feed?${queryString}` : "/feed";
};

export default async function FeedPage({ searchParams }: FeedPageProps) {
  await requireManifestoUser();
  await ensureCuratedFeedSources();

  const query = await searchParams;
  const windowMode = query.window === "all" ? "all-time" : "rolling-24h";
  const dayOffset = clampDayOffset(query.dayOffset);
  const requestedPage = clampPage(query.page);
  const feedWindow = windowMode === "all-time" ? { mode: "all-time" as const } : { mode: "rolling-24h" as const, dayOffset };
  const { posts: feedPosts, totalCount: totalRankedPosts, page: activePage, totalPages } = await getRankedFeedPosts({
    page: requestedPage,
    pageSize: feedPageSize,
    window: feedWindow,
  });
  const [sourceCount, pendingSummaries] = await Promise.all([
    prisma.feedSource.count({
      where: {
        isActive: true,
      },
    }),
    prisma.post.count({
      where: {
        summaryStatus: "PENDING",
      },
    }),
  ]);

  const submitted = hasSearchFlag(query, "submitted");
  const commented = hasSearchFlag(query, "commented");
  const commentError = readSearchParam(query, "commentError");
  const now = new Date();
  const activeWindowLabel = windowMode === "all-time" ? "All time" : buildWindowLabel(dayOffset, now);
  const rankedPostsLabel =
    totalRankedPosts === 0
      ? "0 ranked posts"
      : `${(activePage - 1) * feedPageSize + 1}-${(activePage - 1) * feedPageSize + feedPosts.length} of ${totalRankedPosts} ranked posts`;

  const dayOptions = Array.from({ length: Math.min(dayOptionsCount, maxFeedDayOffset + 1) }, (_, idx) => ({
    href: buildFeedHref({
      windowMode: "rolling-24h",
      dayOffset: idx,
      page: 1,
    }),
    label: idx === 0 ? "Last 24h" : buildWindowLabel(idx, now),
    active: windowMode !== "all-time" && dayOffset === idx,
  }));

  const previousPageHref = buildFeedHref({
    windowMode,
    dayOffset,
    page: activePage - 1,
  });
  const nextPageHref = buildFeedHref({
    windowMode,
    dayOffset,
    page: activePage + 1,
  });

  return (
    <section className="lloyds-page">
      <header className="masthead">
        <h1>Lloyd&apos;s List</h1>
        <p>Anonymous submissions. No karma. Signal-first curation.</p>
      </header>

      <div className="split-grid">
        <div className="lloyds-page">
          {submitted ? <Flash tone="success" message="Submission accepted. Summary generation queued." /> : null}
          {commented ? <Flash tone="success" message="Comment posted." /> : null}
          {commentErrorCopy[commentError] ? <Flash tone="error" message={commentErrorCopy[commentError]} /> : null}

          <div className="feed-window-row">
            {dayOptions.map((option) => (
              <Link
                key={option.href}
                href={option.href}
                className={`feed-window-pill lloyds-pill ${option.active ? "feed-window-pill-active" : ""}`}
              >
                {option.label}
              </Link>
            ))}
            <Link
              href={buildFeedHref({
                windowMode: "all-time",
                dayOffset,
                page: 1,
              })}
              className={`feed-window-pill lloyds-pill ${windowMode === "all-time" ? "feed-window-pill-active" : ""}`}
            >
              All time
            </Link>
          </div>

          <div className="stats-row">
            <span className="lloyds-pill">{rankedPostsLabel}</span>
            <span className="lloyds-pill">{activeWindowLabel}</span>
            <span className="lloyds-pill">{sourceCount} active feed sources</span>
            <span className="lloyds-pill">{pendingSummaries} summaries pending</span>
          </div>

          <div className="feed-grid">
            {feedPosts.length === 0 ? (
              <article className="panel">
                <h2>No Posts Yet</h2>
                <p>
                  Add sources via seeding or submit your first article. Once ingestion jobs run, the feed appears here.
                </p>
                <p>
                  <Link href="/submit">Submit the first post</Link>
                </p>
              </article>
            ) : (
              feedPosts.map((post) => (
                <FeedPostCard
                  key={post.id}
                  postId={post.id}
                  title={post.title}
                  url={post.url}
                  domain={post.domain}
                  publishedAt={post.publishedAt}
                  sourceLabel={post.feedSource?.name ?? (post.sourceType === "USER_SUBMISSION" ? "Community submission" : "Curated feed")}
                  summaryBullets={parseBullets(post.summaryBullets)}
                  summaryReadSeconds={post.summaryReadSeconds}
                  summaryStatus={post.summaryStatus}
                  excerpt={post.excerpt}
                  qualityRating={post.qualityRating}
                  qualityRationale={post.qualityRationale}
                  commentsCount={post._count.comments}
                />
              ))
            )}
          </div>

          {totalPages > 1 ? (
            <nav className="feed-pagination-row" aria-label="Feed pages">
              {activePage > 1 ? (
                <Link href={previousPageHref} className="lloyds-button-secondary">
                  Previous page
                </Link>
              ) : (
                <span className="lloyds-pill feed-pagination-disabled">Previous page</span>
              )}
              <span className="lloyds-pill">
                Page {activePage} of {totalPages}
              </span>
              {activePage < totalPages ? (
                <Link href={nextPageHref} className="lloyds-button-secondary">
                  Next page
                </Link>
              ) : (
                <span className="lloyds-pill feed-pagination-disabled">Next page</span>
              )}
            </nav>
          ) : null}
        </div>

        <aside className="lloyds-page">
          <section className="panel">
            <h2>House Rules</h2>
            <ul className="list-clean">
              <li>Posts are displayed without submitter attribution.</li>
              <li>No karma, no engagement farming, no vanity loops.</li>
              <li>AI summaries are designed for a 10-30 second pre-read.</li>
              <li>Quality tiers follow the Lloyd&apos;s Constitution from Common Rumour to The Lloyd&apos;s Assurance.</li>
              <li>Open the source article for full context before strong judgment.</li>
            </ul>
            <div className="house-rules-action">
              <a href={constitutionGistUrl} target="_blank" rel="noreferrer noopener" className="lloyds-button-secondary">
                Read Constitution
              </a>
            </div>
          </section>

          <section className="panel">
            <h2>Contribute</h2>
            <p>Submit high-value long-form writing or refine your profile for better matching.</p>
            <div className="form-grid">
              <Link href="/submit" className="lloyds-button-secondary">
                Submit Article
              </Link>
              <Link href="/profile" className="lloyds-button-secondary">
                Edit Profile
              </Link>
              <Link href="/matching" className="lloyds-button-secondary">
                Find Conversations
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
