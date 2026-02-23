import { updateProfileAction } from "@/actions/profile";
import { Flash } from "@/components/flash";
import { requireManifestoUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

type ProfilePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorCopy: Record<string, string> = {
  "invalid-input": "Some fields failed validation. Please review and submit again.",
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const user = await requireManifestoUser();
  const query = await searchParams;

  const [profile, blogPostsCount] = await Promise.all([
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
        blogFeedUrl: true,
      },
    }),
    prisma.post.count({
      where: {
        submittedById: user.id,
        sourceType: "USER_BLOG",
      },
    }),
  ]);

  const saved = query.saved === "1";
  const errorKey = typeof query.error === "string" ? query.error : "";

  return (
    <section className="lloyds-page">
      <header className="masthead">
        <h1>Member Ledger</h1>
        <p>Your profile powers feed personalization and conversation matching.</p>
      </header>

      <div className="split-grid">
        <form action={updateProfileAction} className="panel form-grid">
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

          <label htmlFor="blogFeedUrl">
            Blog RSS URL
            <input
              id="blogFeedUrl"
              name="blogFeedUrl"
              type="url"
              defaultValue={profile.blogFeedUrl ?? ""}
              placeholder="https://yourblog.com/feed.xml"
            />
          </label>

          <button type="submit" className="lloyds-button">
            Save Profile
          </button>
        </form>

        <aside className="lloyds-page">
          <section className="panel">
            <h2>Matching Inputs</h2>
            <ul className="list-clean">
              <li>Interests + goals shape compatibility scoring.</li>
              <li>Ideas-in-flight generate higher quality intro context.</li>
              <li>Your linked blog feed continuously enriches profile signals.</li>
            </ul>
          </section>

          <section className="panel">
            <h2>Integration State</h2>
            <p>Email: {profile.email ?? "No email found"}</p>
            <p>Blog posts ingested from your feed: {blogPostsCount}</p>
            <p>
              Configure Google calendar scheduling and appointment schedules in Settings.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
