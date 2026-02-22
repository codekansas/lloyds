import type { Prisma } from "@prisma/client";
import Link from "next/link";

import { Flash } from "@/components/flash";
import { FeedPostCard } from "@/components/feed-post-card";
import { requireManifestoUser } from "@/lib/auth-guards";
import { getRankedFeedPosts } from "@/lib/feed";
import { prisma } from "@/lib/prisma";
import { ensureCuratedFeedSources } from "@/lib/seed-curated";

type FeedPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const parseBullets = (value: Prisma.JsonValue | null): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
};

export default async function FeedPage({ searchParams }: FeedPageProps) {
  await requireManifestoUser();
  await ensureCuratedFeedSources();

  const query = await searchParams;
  const feedPosts = await getRankedFeedPosts(40);
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

  return (
    <section className="lloyds-page">
      <header className="masthead">
        <h1>Lloyd&apos;s List</h1>
        <h2>Long-Form Intelligence Feed</h2>
        <p>Anonymous submissions. No karma. Signal-first curation.</p>
      </header>

      <div className="split-grid">
        <div className="lloyds-page">
          {submitted ? <Flash tone="success" message="Submission accepted. Summary generation queued." /> : null}

          <div className="stats-row">
            <span>{feedPosts.length} ranked posts</span>
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
                  title={post.title}
                  url={post.url}
                  domain={post.domain}
                  publishedAt={post.publishedAt}
                  sourceLabel={post.feedSource?.name ?? (post.sourceType === "USER_SUBMISSION" ? "Community submission" : "Curated feed")}
                  summaryBullets={parseBullets(post.summaryBullets)}
                  summaryReadSeconds={post.summaryReadSeconds}
                  summaryStatus={post.summaryStatus}
                  excerpt={post.excerpt}
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
