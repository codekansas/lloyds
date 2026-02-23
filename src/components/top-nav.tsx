import Link from "next/link";

import { signOutAction } from "@/actions/auth";

type TopNavProps = {
  isAuthed: boolean;
  acceptedManifesto: boolean;
  isBanned: boolean;
  userName: string | null | undefined;
};

export const TopNav = ({ isAuthed, acceptedManifesto, isBanned, userName }: TopNavProps) => {
  return (
    <header className="lloyds-nav">
      <div className="lloyds-nav-inner">
        <Link href="/" className="lloyds-wordmark" prefetch={false}>
          Lloyd&apos;s Coffee House
        </Link>

        <nav className="lloyds-nav-links">
          <Link href="/" prefetch={false}>
            Feed
          </Link>
          <Link href="/status" prefetch={false}>
            Status
          </Link>
          {acceptedManifesto && !isBanned ? (
            <Link href="/profile" prefetch={false}>
              Profile
            </Link>
          ) : null}
          {isAuthed && !acceptedManifesto && !isBanned ? (
            <Link href="/manifesto" prefetch={false}>
              Community Standards
            </Link>
          ) : null}
        </nav>

        <div className="lloyds-nav-user">
          {isAuthed ? (
            <>
              <span>{userName || "Member"}</span>
              {isBanned ? <span className="lloyds-pill">Banned</span> : null}
              <form action={signOutAction}>
                <button type="submit" className="lloyds-button-secondary">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <span>Guests can read the feed. Sign in to comment.</span>
          )}
        </div>
      </div>
    </header>
  );
};
