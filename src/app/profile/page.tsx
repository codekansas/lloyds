import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

import { markReplyNotificationsReadAction } from "@/actions/notifications";
import { updateProfileAction } from "@/actions/profile";
import { Flash } from "@/components/flash";
import { requireManifestoUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { hasSearchFlag, readSearchParam } from "@/lib/search-params";

type ProfilePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorCopy: Record<string, string> = {
  "invalid-input": "Some fields failed validation. Please review and submit again.",
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const user = await requireManifestoUser();
  const query = await searchParams;

  const [profile, engagedArticles, bookmarkedArticles, replyNotifications] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: {
        id: user.id,
      },
      select: {
        name: true,
        email: true,
        headline: true,
        bio: true,
        interests: true,
        goals: true,
        ideasInFlight: true,
        notifyCommentRepliesInApp: true,
        notifyCommentRepliesEmail: true,
      },
    }),
    prisma.postComment.findMany({
      where: {
        authorId: user.id,
      },
      orderBy: [{ createdAt: "desc" }],
      distinct: ["postId"],
      take: 24,
      select: {
        createdAt: true,
        post: {
          select: {
            id: true,
            title: true,
            url: true,
            domain: true,
            _count: {
              select: {
                comments: true,
              },
            },
          },
        },
      },
    }),
    prisma.postBookmark.findMany({
      where: {
        userId: user.id,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 24,
      select: {
        createdAt: true,
        post: {
          select: {
            id: true,
            title: true,
            url: true,
            domain: true,
            _count: {
              select: {
                comments: true,
              },
            },
          },
        },
      },
    }),
    prisma.commentReplyNotification.findMany({
      where: {
        recipientUserId: user.id,
      },
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
      take: 40,
      select: {
        id: true,
        isRead: true,
        createdAt: true,
        postId: true,
        commentId: true,
        actorUser: {
          select: {
            name: true,
          },
        },
        post: {
          select: {
            title: true,
          },
        },
      },
    }),
  ]);

  const bookmarkedPostIds = new Set(bookmarkedArticles.map((bookmark) => bookmark.post.id));

  const saved = hasSearchFlag(query, "saved");
  const notificationsRead = hasSearchFlag(query, "notificationsRead");
  const errorKey = readSearchParam(query, "error");
  const unreadReplyNotificationCount = replyNotifications.filter((notification) => !notification.isRead).length;

  return (
    <section className="layout-stack">
      <header className="masthead">
        <h1>Member Ledger</h1>
        <p>Share context about what you are building and exploring.</p>
      </header>

      <div className="layout-split">
        <form action={updateProfileAction} className="surface form-stack">
          <h2>Profile</h2>
          {saved ? <Flash tone="success" message="Profile updated." /> : null}
          {errorCopy[errorKey] ? <Flash tone="error" message={errorCopy[errorKey]} /> : null}

          <label htmlFor="name">
            Name
            <input id="name" name="name" type="text" defaultValue={profile.name ?? ""} />
          </label>

          <label htmlFor="headline">
            Headline
            <input
              id="headline"
              name="headline"
              type="text"
              defaultValue={profile.headline ?? ""}
              placeholder="Systems engineer focused on AI governance and market design"
            />
          </label>

          <label htmlFor="bio">
            Background
            <textarea
              id="bio"
              name="bio"
              defaultValue={profile.bio ?? ""}
              placeholder="What have you built? What do you understand unusually well?"
            />
          </label>

          <label htmlFor="interests">
            Interests
            <textarea
              id="interests"
              name="interests"
              defaultValue={profile.interests ?? ""}
              placeholder="AI alignment, epistemics, institutional design, startup finance..."
            />
          </label>

          <label htmlFor="goals">
            Goals
            <textarea
              id="goals"
              name="goals"
              defaultValue={profile.goals ?? ""}
              placeholder="What outcomes are you trying to cause in the next 12 months?"
            />
          </label>

          <label htmlFor="ideasInFlight">
            Ideas In Flight
            <textarea
              id="ideasInFlight"
              name="ideasInFlight"
              defaultValue={profile.ideasInFlight ?? ""}
              placeholder="Open questions you are actively exploring right now."
            />
          </label>

          <fieldset className="profile-notification-settings">
            <legend>Reply Notifications</legend>
            <label htmlFor="notifyCommentRepliesInApp" className="checkbox-field">
              <input
                id="notifyCommentRepliesInApp"
                name="notifyCommentRepliesInApp"
                type="checkbox"
                defaultChecked={profile.notifyCommentRepliesInApp}
              />
              <span>Enable in-app notifications when someone replies to your comments.</span>
            </label>
            <label htmlFor="notifyCommentRepliesEmail" className="checkbox-field">
              <input
                id="notifyCommentRepliesEmail"
                name="notifyCommentRepliesEmail"
                type="checkbox"
                defaultChecked={profile.notifyCommentRepliesEmail}
              />
              <span>Enable email notifications for comment replies (rate-limited).</span>
            </label>
            <p className="profile-note">
              All notifications are opt-in. Email alerts are rate-limited to prevent inbox spam.
            </p>
          </fieldset>

          <button type="submit" className="btn btn-primary">
            Save Profile
          </button>
        </form>

        <aside className="layout-stack">
          <section className="surface profile-activity-panel">
            <h2>Article Activity</h2>
            <p className="profile-note">Review articles you have engaged with and those you have bookmarked.</p>

            <div className="profile-activity-columns">
              <section className="layout-stack">
                <h3>Engaged</h3>
                {engagedArticles.length === 0 ? (
                  <p className="profile-note">No engaged articles yet. Join a thread to build your ledger.</p>
                ) : (
                  <ul className="list-reset profile-article-list">
                    {engagedArticles.map((engagedArticle) => (
                      <li key={engagedArticle.post.id} className="profile-article-item">
                        <a href={engagedArticle.post.url} target="_blank" rel="noreferrer noopener">
                          {engagedArticle.post.title}
                        </a>
                        <div className="inline-cluster">
                          <Link href={`/feed/${engagedArticle.post.id}/comments`} className="chip">
                            Comments ({engagedArticle.post._count.comments})
                          </Link>
                          <span className="chip">
                            Engaged {formatDistanceToNow(engagedArticle.createdAt, { addSuffix: true })}
                          </span>
                          {engagedArticle.post.domain ? <span className="chip">{engagedArticle.post.domain}</span> : null}
                          {bookmarkedPostIds.has(engagedArticle.post.id) ? <span className="chip">Bookmarked</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="layout-stack">
                <h3>Bookmarked</h3>
                {bookmarkedArticles.length === 0 ? (
                  <p className="profile-note">No bookmarks yet. Save articles from the feed to revisit them here.</p>
                ) : (
                  <ul className="list-reset profile-article-list">
                    {bookmarkedArticles.map((bookmark) => (
                      <li key={bookmark.post.id} className="profile-article-item">
                        <a href={bookmark.post.url} target="_blank" rel="noreferrer noopener">
                          {bookmark.post.title}
                        </a>
                        <div className="inline-cluster">
                          <Link href={`/feed/${bookmark.post.id}/comments`} className="chip">
                            Comments ({bookmark.post._count.comments})
                          </Link>
                          <span className="chip">Saved {formatDistanceToNow(bookmark.createdAt, { addSuffix: true })}</span>
                          {bookmark.post.domain ? <span className="chip">{bookmark.post.domain}</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </section>

          <section className="surface profile-notification-panel">
            <div className="profile-notification-header">
              <h2>In-App Reply Notifications</h2>
              {profile.notifyCommentRepliesInApp ? <span className="chip">{unreadReplyNotificationCount} unread</span> : null}
            </div>

            {notificationsRead ? <Flash tone="success" message="Reply notifications marked as read." /> : null}

            {!profile.notifyCommentRepliesInApp ? (
              <p className="profile-note">Enable in-app reply notifications above to receive alerts here.</p>
            ) : replyNotifications.length === 0 ? (
              <p className="profile-note">No reply notifications yet.</p>
            ) : (
              <>
                {unreadReplyNotificationCount > 0 ? (
                  <form action={markReplyNotificationsReadAction}>
                    <button type="submit" className="btn btn-secondary">
                      Mark all as read
                    </button>
                  </form>
                ) : null}

                <ul className="list-reset profile-notification-list">
                  {replyNotifications.map((notification) => (
                    <li
                      key={notification.id}
                      className={
                        notification.isRead
                          ? "profile-notification-item"
                          : "profile-notification-item profile-notification-item-unread"
                      }
                    >
                      <p>
                        <strong>{notification.actorUser.name?.trim() || "A member"}</strong> replied on <em>{notification.post.title}</em>.
                      </p>
                      <div className="inline-cluster">
                        <Link href={`/feed/${notification.postId}/comments#comment-${notification.commentId}`} className="chip">
                          Open reply
                        </Link>
                        <span className="chip">{formatDistanceToNow(notification.createdAt, { addSuffix: true })}</span>
                        {!notification.isRead ? <span className="chip">Unread</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="surface">
            <h2>Profile Notes</h2>
            <ul className="list-reset">
              <li>Use concrete language about active projects and questions.</li>
              <li>Include specifics others can respond to in conversation.</li>
              <li>Keep this updated as your work evolves.</li>
            </ul>
          </section>

          <section className="surface">
            <h2>Account</h2>
            <p>Email: {profile.email ?? "No email found"}</p>
          </section>
        </aside>
      </div>
    </section>
  );
}
