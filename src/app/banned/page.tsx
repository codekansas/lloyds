import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAction } from "@/actions/auth";
import { requireUserWithOptions } from "@/lib/auth-guards";
import { constitutionGistUrl } from "@/lib/constitution";

const formatBanTimestamp = (value: Date): string => {
  return `${value.toISOString().slice(0, 16).replace("T", " ")} UTC`;
};

export default async function BannedPage() {
  const user = await requireUserWithOptions({
    allowBanned: true,
  });

  if (!user.accountBannedAt) {
    if (user.manifestoAcceptedAt) {
      redirect("/");
    }

    redirect("/manifesto");
  }

  const bannedAtLabel = formatBanTimestamp(user.accountBannedAt);

  return (
    <section className="layout-stack">
      <header className="masthead">
        <h1>Account Banned</h1>
        <p>Your account has been permanently disabled for repeated constitutional comment violations.</p>
      </header>

      <article className="surface">
        <p>Banned at: {bannedAtLabel}</p>
        <p>Reason: {user.accountBanReason ?? "Repeated constitutional violations in comment moderation."}</p>
        <p>
          Constitutional source of truth:{" "}
          <a href={constitutionGistUrl} target="_blank" rel="noreferrer noopener">
            {constitutionGistUrl}
          </a>
        </p>
        <p>
          If you believe this is an error, contact an administrator. You can also <Link href="/">return home</Link>.
        </p>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-secondary">
            Sign out
          </button>
        </form>
      </article>
    </section>
  );
}
