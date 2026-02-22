import { redirect } from "next/navigation";

import { signInWithGithubAction, signInWithGoogleAction } from "@/actions/auth";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import { manifestoParagraphs, manifestoTitle } from "@/lib/manifesto";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.manifestoAcceptedAt) {
    redirect("/feed");
  }

  if (session?.user) {
    redirect("/manifesto");
  }

  return (
    <section className="lloyds-page">
      <header className="masthead">
        <h1>Lloyd&apos;s Coffee House</h1>
        <h2>and Reasoning Gazette</h2>
        <p>Established for builders, engineers, and deep thinkers.</p>
      </header>

      <div className="split-grid">
        <article className="panel manifesto">
          <div className="manifesto-copy">
            <h2>{manifestoTitle}</h2>
            {manifestoParagraphs.slice(0, 3).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <p>
              Entry requires agreement to the full covenant before any feed, profile, or matching features are visible.
            </p>
          </div>
        </article>

        <aside className="panel home-entry-panel">
          <h2>Enter the House</h2>
          <p>
            Sign in with a standard provider. You will be asked to explicitly accept the covenant before continuing.
          </p>
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
        </aside>
      </div>
    </section>
  );
}
