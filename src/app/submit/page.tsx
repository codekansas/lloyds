import Link from "next/link";

import { submitPostAction } from "@/actions/post";
import { Flash } from "@/components/flash";
import { requireManifestoUser } from "@/lib/auth-guards";
import { readSearchParam } from "@/lib/search-params";

type SubmitPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorCopy: Record<string, string> = {
  "invalid-input": "Please provide a valid title and URL.",
  "invalid-url": "URL normalization failed. Check the article link and try again.",
  "already-exists": "This article is already in the feed.",
};

export default async function SubmitPage({ searchParams }: SubmitPageProps) {
  await requireManifestoUser();

  const query = await searchParams;
  const errorKey = readSearchParam(query, "error");

  return (
    <section className="lloyds-page">
      <header className="masthead">
        <h1>Dispatch Desk</h1>
        <p>Submissions are anonymous by design and routed through AI summarization.</p>
      </header>

      <div className="split-grid">
        <form action={submitPostAction} className="panel form-grid">
          <h2>Submit an Article</h2>
          {errorCopy[errorKey] ? <Flash tone="error" message={errorCopy[errorKey]} /> : null}

          <label htmlFor="title">
            Title
            <input id="title" name="title" type="text" placeholder="The Future of Coordination Under AI" required />
          </label>

          <label htmlFor="url">
            URL
            <input id="url" name="url" type="url" placeholder="https://example.com/article" required />
          </label>

          <button type="submit" className="lloyds-button">
            Add to Queue
          </button>
        </form>

        <aside className="panel">
          <h2>Submission Standard</h2>
          <ul className="list-clean">
            <li>Prioritize durable ideas over reactive hot takes.</li>
            <li>Prefer articles with concrete models, data, or falsifiable claims.</li>
            <li>Links are deduped and summarized before ranking.</li>
            <li>Submitter identity is never displayed in the feed.</li>
          </ul>
          <p>
            Return to <Link href="/feed">the feed</Link>.
          </p>
        </aside>
      </div>
    </section>
  );
}
