import Link from "next/link";

import { signOutAction } from "@/actions/auth";

type TopNavProps = {
  isAuthed: boolean;
  acceptedManifesto: boolean;
  userName: string | null | undefined;
};

export const TopNav = ({ isAuthed, acceptedManifesto, userName }: TopNavProps) => {
  return (
    <header className="lloyds-nav">
      <div className="lloyds-nav-inner">
        <Link href="/" className="lloyds-wordmark" prefetch={false}>
          Lloyd&apos;s Coffee House
        </Link>

        <nav className="lloyds-nav-links">
          {acceptedManifesto ? (
            <>
              <Link href="/feed" prefetch={false}>
                Feed
              </Link>
              <Link href="/submit" prefetch={false}>
                Submit
              </Link>
              <Link href="/profile" prefetch={false}>
                Profile
              </Link>
              <Link href="/settings" prefetch={false}>
                Settings
              </Link>
              <Link href="/matching" prefetch={false}>
                Match
              </Link>
            </>
          ) : null}
        </nav>

        <div className="lloyds-nav-user">
          {isAuthed ? (
            <>
              <span>{userName || "Member"}</span>
              <form action={signOutAction}>
                <button type="submit" className="lloyds-button-secondary">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <span>Guests welcome. Covenant required.</span>
          )}
        </div>
      </div>
    </header>
  );
};
