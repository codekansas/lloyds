import type { Prisma } from "@prisma/client";
import Link from "next/link";

import { Flash } from "@/components/flash";
import { FeedPostCard } from "@/components/feed-post-card";
import { requireManifestoUser } from "@/lib/auth-guards";
import { getRankedFeedPosts, maxFeedDayOffset } from "@/lib/feed";
import { prisma } from "@/lib/prisma";
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
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

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

const buildWindowLabel = (dayOffset: number, now: Date): string => {
  if (dayOffset === 0) {
    return "Last 24 hours";
  }

  const end = new Date(now.valueOf() - dayOffset * dayMs);
  const start = new Date(end.valueOf() - dayMs);
  const inclusiveEnd = new Date(end.valueOf() - 1_000);

  return `${dateFormatter.format(start)} - ${dateFormatter.format(inclusiveEnd)}`;
};

export default async function FeedPage({ searchParams }: FeedPageProps) {
  await requireManifestoUser();
  await ensureCuratedFeedSources();

  const query = await searchParams;
  const windowMode = query.window === "all" ? "all-time" : "rolling-24h";
  const dayOffset = clampDayOffset(query.dayOffset);
  const feedWindow = windowMode === "all-time" ? { mode: "all-time" as const } : { mode: "rolling-24h" as const, dayOffset };
  const feedPosts = await getRankedFeedPosts(40, feedWindow);
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

  const submitted = query.submitted === "1";
  const commented = query.commented === "1";
  const commentError = typeof query.commentError === "string" ? query.commentError : "";
  const now = new Date();
  const activeWindowLabel = windowMode === "all-time" ? "All time" : buildWindowLabel(dayOffset, now);

  const dayOptions = Array.from({ length: Math.min(dayOptionsCount, maxFeedDayOffset + 1) }, (_, idx) => ({
    href: idx === 0 ? "/feed" : `/feed?dayOffset=${idx}`,
    label: idx === 0 ? "Last 24h" : buildWindowLabel(idx, now),
    active: windowMode !== "all-time" && dayOffset === idx,
  }));

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
                className={`feed-window-pill ${option.active ? "feed-window-pill-active" : ""}`}
              >
                {option.label}
              </Link>
            ))}
            <Link
              href="/feed?window=all"
              className={`feed-window-pill ${windowMode === "all-time" ? "feed-window-pill-active" : ""}`}
            >
              All time
            </Link>
          </div>

          <div className="stats-row">
            <span>{feedPosts.length} ranked posts</span>
            <span>{activeWindowLabel}</span>
            <span>{sourceCount} active feed sources</span>
            <span>{pendingSummaries} summaries pending</span>
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
