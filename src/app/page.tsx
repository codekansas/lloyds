import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signInWithGithubAction, signInWithGoogleAction } from "@/actions/auth";
import { auth } from "@/auth";
import { FeedPostCard } from "@/components/feed-post-card";
import { Flash } from "@/components/flash";
import { getCommentErrorMessage } from "@/lib/comment-feedback";
import { constitutionGistUrl } from "@/lib/constitution";
import { curatedFeedsGistUrl } from "@/lib/curated-feeds";
import { env } from "@/lib/env";
import { getRankedFeedPosts, maxFeedDayOffset } from "@/lib/feed";
import { prisma } from "@/lib/prisma";
import { hasSearchFlag, readSearchParam, readSearchParamNumber } from "@/lib/search-params";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  return queryString.length > 0 ? `/?${queryString}` : "/";
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const [session, query] = await Promise.all([auth(), searchParams]);

  if (session?.user?.accountBannedAt) {
    redirect("/banned");
  }

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

  const commented = hasSearchFlag(query, "commented");
  const commentError = readSearchParam(query, "commentError");
  const commentSuspendedUntil = readSearchParam(query, "commentSuspendedUntil");
  const commentViolationCount = readSearchParamNumber(query, "violationCount");
  const commentErrorMessage = getCommentErrorMessage({
    commentError,
    suspendedUntilIso: commentSuspendedUntil,
    violationCount: commentViolationCount,
  });
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
  const hasAcceptedManifesto = Boolean(session?.user?.manifestoAcceptedAt);

  return (
    <section className="lloyds-page">
      <header className="masthead">
        <h1>Lloyd&apos;s List</h1>
        <p>Curated RSS. No karma. Signal-first ranking.</p>
      </header>

      <div className="split-grid">
        <div className="lloyds-page">
          {commented ? <Flash tone="success" message="Comment posted." /> : null}
          {commentErrorMessage ? <Flash tone="error" message={commentErrorMessage} /> : null}

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
                <p>Feed items appear after RSS ingestion runs against the curated sources gist.</p>
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
              <li>Open the source article for full context before strong judgment.</li>
              <li>Lloyd is an AI moderator that just follows the constitution, linked below.</li>
            </ul>
            <div className="house-rules-action button-row">
              <a href={constitutionGistUrl} target="_blank" rel="noreferrer noopener" className="lloyds-button-secondary">
                Read Constitution
              </a>
              <a href={curatedFeedsGistUrl} target="_blank" rel="noreferrer noopener" className="lloyds-button-secondary">
                View Feed Sources
              </a>
            </div>
          </section>

          <section className="panel">
            <h2>Participation</h2>
            {!session?.user ? (
              <>
                <p>Guests can read the feed. Sign in to comment and join discussion.</p>
                <p>Posting requires agreeing to the community standards.</p>
                <div className="form-grid">
                  {env.hasGoogleOAuth ? (
                    <form action={signInWithGoogleAction}>
                      <button type="submit" className="lloyds-button">
                        Continue with Google
                      </button>
                    </form>
                  ) : null}
                  {env.hasGithubOAuth ? (
                    <form action={signInWithGithubAction}>
                      <button type="submit" className="lloyds-button-secondary">
                        Continue with GitHub
                      </button>
                    </form>
                  ) : null}
                  {!env.hasGoogleOAuth && !env.hasGithubOAuth ? (
                    <p>Sign-in providers are not configured yet for this environment.</p>
                  ) : null}
                </div>
              </>
            ) : !hasAcceptedManifesto ? (
              <>
                <p>You are signed in. Agree to the community standards before commenting.</p>
                <Link href="/manifesto" className="lloyds-button">
                  Review Standards
                </Link>
              </>
            ) : (
              <>
                <p>Community standards accepted. You can comment and edit your profile.</p>
                <Link href="/profile" className="lloyds-button-secondary">
                  Edit Profile
                </Link>
              </>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
