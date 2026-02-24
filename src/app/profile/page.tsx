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

  const profile = await prisma.user.findUniqueOrThrow({
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
    },
  });

  const saved = hasSearchFlag(query, "saved");
  const errorKey = readSearchParam(query, "error");

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

          <button type="submit" className="btn btn-primary">
            Save Profile
          </button>
        </form>

        <aside className="layout-stack">
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
