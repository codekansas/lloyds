import { redirect } from "next/navigation";

import { acceptManifestoAction } from "@/actions/manifesto";
import { auth } from "@/auth";
import { Flash } from "@/components/flash";
import { manifestoParagraphs, manifestoTenets, manifestoTitle } from "@/lib/manifesto";
import { readSearchParam } from "@/lib/search-params";

type ManifestoPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorCopy: Record<string, string> = {
  "accept-required": "You must explicitly accept the covenant to continue.",
  "tenets-required": "Please agree to every tenet before entering.",
};

export default async function ManifestoPage({ searchParams }: ManifestoPageProps) {
  const session = await auth();
  const query = await searchParams;

  if (!session?.user) {
    redirect("/");
  }

  if (session.user.accountBannedAt) {
    redirect("/banned");
  }

  if (session.user.manifestoAcceptedAt) {
    redirect("/feed");
  }

  const errorKey = readSearchParam(query, "error");

  return (
    <section className="lloyds-page">
      <header className="masthead">
        <h1>Lloyd&apos;s Coffee House</h1>
        <p>No access without principled consent.</p>
      </header>

      <div className="panel manifesto manifesto-with-form">
        <div className="manifesto-copy">
          <h2>{manifestoTitle}</h2>
          {manifestoParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <form action={acceptManifestoAction} className="form-grid">
          {errorCopy[errorKey] ? <Flash tone="error" message={errorCopy[errorKey]} /> : null}

          <div className="manifesto-tenets">
            {manifestoTenets.map((tenet, idx) => (
              <label key={tenet} htmlFor={`tenet-${idx}`}>
                <input id={`tenet-${idx}`} name={`tenet-${idx}`} type="checkbox" required />
                <span>{tenet}</span>
              </label>
            ))}

            <label htmlFor="accept">
              <input id="accept" name="accept" type="checkbox" required />
              <span>I accept this covenant and will abide by it in spirit, not merely form.</span>
            </label>
          </div>

          <button type="submit" className="lloyds-button">
            Agree and Enter
          </button>
        </form>
      </div>
    </section>
  );
}
