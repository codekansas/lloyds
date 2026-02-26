import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signInWithGithubAction, signInWithGoogleAction } from "@/actions/auth";
import { auth } from "@/auth";
import { FeedPostCard } from "@/components/feed-post-card";
import { Flash } from "@/components/flash";
import { getCommentErrorFeedback } from "@/lib/comment-feedback";
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

const feedPageSize = 10;

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
  const { posts: feedPosts, page: activePage, totalPages } = await getRankedFeedPosts({
    page: requestedPage,
    pageSize: feedPageSize,
    window: feedWindow,
  });
  const visiblePostIds = feedPosts.map((post) => post.id);
  const currentFeedHref = buildFeedHref({
    windowMode,
    dayOffset,
    page: activePage,
  });
  const bookmarkRecords =
    session?.user?.id && visiblePostIds.length > 0
      ? await prisma.postBookmark.findMany({
          where: {
            userId: session.user.id,
            postId: {
              in: visiblePostIds,
            },
          },
          select: {
            postId: true,
          },
        })
      : [];
  const bookmarkedPostIds = new Set(bookmarkRecords.map((bookmark) => bookmark.postId));

  const commented = hasSearchFlag(query, "commented");
  const commentError = readSearchParam(query, "commentError");
  const commentSuspendedUntil = readSearchParam(query, "commentSuspendedUntil");
  const commentViolationCount = readSearchParamNumber(query, "violationCount");
  const commentErrorFeedback = getCommentErrorFeedback({
    commentError,
    suspendedUntilIso: commentSuspendedUntil,
    violationCount: commentViolationCount,
  });
  const bookmarkState = readSearchParam(query, "bookmark");
  const bookmarkMessage =
    bookmarkState === "saved"
      ? "Article bookmarked."
      : bookmarkState === "removed"
        ? "Bookmark removed."
        : bookmarkState === "post-not-found"
          ? "Bookmark failed. Article was not found."
          : bookmarkState === "invalid"
            ? "Bookmark request was invalid."
            : "";
  const bookmarkMessageTone = bookmarkState === "saved" || bookmarkState === "removed" ? "success" : "error";
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
    <section className="layout-stack">
      <header className="masthead">
        <h1>Lloyd&apos;s List</h1>
        <p>Curated RSS. No karma. Signal-first ranking.</p>
      </header>

      <div className="layout-split">
        <div className="layout-stack">
          {commented ? <Flash tone="success" message="Comment posted." /> : null}
          {commentErrorFeedback ? (
            <Flash
              tone="error"
              message={
                <>
                  {commentErrorFeedback.message}{" "}
                  {commentErrorFeedback.constitutionLinkLabel ? (
                    <a href={constitutionGistUrl} target="_blank" rel="noreferrer noopener" className="flash-link">
                      {commentErrorFeedback.constitutionLinkLabel}
                    </a>
                  ) : null}
                </>
              }
            />
          ) : null}
          {bookmarkMessage ? <Flash tone={bookmarkMessageTone} message={bookmarkMessage} /> : null}

          <div className="feed-grid">
            {feedPosts.length === 0 ? (
              <article className="surface">
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
                  qualityModel={post.qualityModel}
                  commentsCount={post._count.comments}
                  canBookmark={Boolean(session?.user && hasAcceptedManifesto)}
                  isBookmarked={bookmarkedPostIds.has(post.id)}
                  bookmarkReturnTo={currentFeedHref}
                />
              ))
            )}
          </div>

          {totalPages > 1 ? (
            <nav className="feed-pagination-row" aria-label="Feed pages">
              {activePage > 1 ? (
                <Link href={previousPageHref} className="btn btn-secondary">
                  Previous page
                </Link>
              ) : (
                <span className="chip feed-pagination-disabled">Previous page</span>
              )}
              <span className="chip">
                Page {activePage} of {totalPages}
              </span>
              {activePage < totalPages ? (
                <Link href={nextPageHref} className="btn btn-secondary">
                  Next page
                </Link>
              ) : (
                <span className="chip feed-pagination-disabled">Next page</span>
              )}
            </nav>
          ) : null}
        </div>

        <aside className="layout-stack">
          <section className="surface">
            <h2>House Rules</h2>
            <ul className="list-reset">
              <li>Open the source article for full context before strong judgment.</li>
              <li>Lloyd is an AI moderator that just follows the constitution, linked below.</li>
            </ul>
            <div className="house-rules-action inline-cluster">
              <a href={constitutionGistUrl} target="_blank" rel="noreferrer noopener" className="btn btn-secondary">
                Read Constitution
              </a>
              <a href={curatedFeedsGistUrl} target="_blank" rel="noreferrer noopener" className="btn btn-secondary">
                View Feed Sources
              </a>
            </div>
          </section>

          <section className="surface">
            <h2>Participation</h2>
            {!session?.user ? (
              <>
                <p>Guests can read the feed. Sign in to comment and join discussion.</p>
                <p>Posting requires agreeing to the community standards.</p>
                <div className="form-stack">
                  {env.hasGoogleOAuth ? (
                    <form action={signInWithGoogleAction}>
                      <button type="submit" className="btn btn-primary">
                        Continue with Google
                      </button>
                    </form>
                  ) : null}
                  {env.hasGithubOAuth ? (
                    <form action={signInWithGithubAction}>
                      <button type="submit" className="btn btn-secondary">
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
                <Link href="/manifesto" className="btn btn-primary">
                  Review Standards
                </Link>
              </>
            ) : (
              <>
                <p>Community standards accepted. You can comment and edit your profile.</p>
                <Link href="/profile" className="btn btn-secondary">
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
