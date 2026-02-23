import { format } from "date-fns";

import { addAvailabilityAction, runMatchingNowAction } from "@/actions/availability";
import { Flash } from "@/components/flash";
import { requireManifestoUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { hasSearchFlag, readSearchParam, readSearchParamNumber } from "@/lib/search-params";

type MatchingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorCopy: Record<string, string> = {
  "invalid-input": "Please complete all required availability fields.",
  "invalid-window": "End time must be after start time.",
};

const formatWindow = (startsAt: Date, endsAt: Date): string => {
  return `${format(startsAt, "eee, MMM d · h:mm a")} - ${format(endsAt, "h:mm a")}`;
};

export default async function MatchingPage({ searchParams }: MatchingPageProps) {
  const user = await requireManifestoUser();
  const query = await searchParams;

  const [profile, availabilities, matches] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: {
        id: user.id,
      },
      select: {
        timezone: true,
      },
    }),
    prisma.availability.findMany({
      where: {
        userId: user.id,
      },
      orderBy: [{ startsAt: "desc" }],
      take: 20,
    }),
    prisma.match.findMany({
      where: {
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      include: {
        userA: {
          select: {
            id: true,
            name: true,
            headline: true,
          },
        },
        userB: {
          select: {
            id: true,
            name: true,
            headline: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 30,
    }),
  ]);

  const errorKey = readSearchParam(query, "error");
  const availabilityAdded = hasSearchFlag(query, "availability", "added");
  const matchedCount = readSearchParamNumber(query, "matched");

  return (
    <section className="lloyds-page">
      <header className="masthead">
        <h1>Conversation Exchange</h1>
        <p>Availability + profile depth + AI compatibility scoring.</p>
      </header>

      <div className="split-grid">
        <div className="lloyds-page">
          <section className="panel">
            <h2>Add Availability</h2>
            {errorCopy[errorKey] ? <Flash tone="error" message={errorCopy[errorKey]} /> : null}
            {availabilityAdded ? <Flash tone="success" message="Availability added." /> : null}
            {Number.isFinite(matchedCount) ? (
              <Flash tone="success" message={`Matching run complete: ${matchedCount} matches created.`} />
            ) : null}

            <form action={addAvailabilityAction} className="form-grid">
              <label htmlFor="startsAt">
                Starts At
                <input id="startsAt" name="startsAt" type="datetime-local" required />
              </label>

              <label htmlFor="endsAt">
                Ends At
                <input id="endsAt" name="endsAt" type="datetime-local" required />
              </label>

              <label htmlFor="timezone">
                Timezone
                <input id="timezone" name="timezone" type="text" defaultValue={profile.timezone} required />
              </label>

              <label htmlFor="mode">
                Meeting Mode
                <select id="mode" name="mode" defaultValue="EITHER">
                  <option value="EITHER">Either</option>
                  <option value="VIRTUAL">Virtual only</option>
                  <option value="IN_PERSON">In-person only</option>
                </select>
              </label>

              <label htmlFor="location">
                Optional Location
                <input id="location" name="location" type="text" placeholder="Soho, London" />
              </label>

              <label htmlFor="notes">
                Optional Notes
                <textarea
                  id="notes"
                  name="notes"
                  placeholder="What kind of conversation are you looking for in this slot?"
                />
              </label>

              <button type="submit" className="lloyds-button">
                Save Window
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>My Availability</h2>
            {availabilities.length === 0 ? (
              <p>No availability windows yet.</p>
            ) : (
              <ul className="list-clean">
                {availabilities.map((availability) => (
                  <li key={availability.id}>
                    {formatWindow(availability.startsAt, availability.endsAt)} | {availability.mode} | {availability.isMatched ? "matched" : "open"}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="lloyds-page">
          <section className="panel">
            <h2>Run Matching</h2>
            <p>
              This triggers a batch run that pairs open windows, checks calendar availability, and creates events when both users have linked Google plus an active appointment schedule.
            </p>
            <form action={runMatchingNowAction}>
              <button type="submit" className="lloyds-button-secondary">
                Run Matching Now
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>Recent Matches</h2>
            {matches.length === 0 ? (
              <p>No matches yet. Add availability and run matching.</p>
            ) : (
              <div className="form-grid">
                {matches.map((match) => {
                  const counterpart = match.userAId === user.id ? match.userB : match.userA;
                  return (
                    <article className="lloyds-card match-card" key={match.id}>
                      <h3>{counterpart.name ?? "Member"}</h3>
                      <p>{counterpart.headline ?? "No headline yet."}</p>
                      <p>{formatWindow(match.slotStartsAt, match.slotEndsAt)}</p>
                      <p>
                        Mode: {match.mode}
                        {match.location ? ` | ${match.location}` : ""}
                      </p>
                      <p>Status: {match.status}</p>
                      <p>{match.aiRationale ?? "Rationale pending."}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
