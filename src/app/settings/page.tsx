import {
  activateAppointmentScheduleAction,
  connectGoogleCalendarAction,
  linkAppointmentScheduleAction,
  unlinkAppointmentScheduleAction,
} from "@/actions/settings";
import { Flash } from "@/components/flash";
import { requireManifestoUser } from "@/lib/auth-guards";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { hasSearchFlag, readSearchParam } from "@/lib/search-params";

type SettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorCopy: Record<string, string> = {
  "google-oauth-disabled": "Google OAuth is not configured in this environment.",
  "google-not-linked": "Link Google Calendar first before adding appointment schedules.",
  "invalid-schedule": "That schedule link is invalid. Please review and try again.",
  "schedule-not-found": "That schedule could not be found.",
};

const scheduleCopy: Record<string, string> = {
  linked: "Appointment schedule linked.",
  updated: "Schedule link already existed. Label updated.",
  active: "Default appointment schedule updated.",
  removed: "Appointment schedule unlinked.",
};

const creationUrl = "https://calendar.google.com/calendar/u/0/r/appointment";

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requireManifestoUser();
  const query = await searchParams;

  const [googleAccount, schedules] = await Promise.all([
    prisma.account.findFirst({
      where: {
        userId: user.id,
        provider: "google",
      },
      select: {
        refresh_token: true,
        scope: true,
      },
    }),
    prisma.appointmentSchedule.findMany({
      where: {
        userId: user.id,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  const errorKey = readSearchParam(query, "error");
  const scheduleKey = readSearchParam(query, "schedule");
  const googleConnected = hasSearchFlag(query, "google", "connected");

  const hasGoogleCalendarAccess = Boolean(
    googleAccount?.refresh_token && googleAccount.scope?.includes("calendar"),
  );
  const activeSchedule = schedules.find((schedule) => schedule.isActive) ?? null;

  return (
    <section className="lloyds-page">
      <header className="masthead">
        <h1>Settings</h1>
        <p>Link Google, connect appointment schedules, and choose your active scheduling surface.</p>
      </header>

      <div className="split-grid">
        <div className="lloyds-page">
          <section className="panel">
            <h2>Google Calendar</h2>
            {googleConnected ? <Flash tone="success" message="Google Calendar linked." /> : null}
            {errorCopy[errorKey] ? <Flash tone="error" message={errorCopy[errorKey]} /> : null}
            {!env.hasGoogleOAuth ? (
              <p>Google OAuth credentials are missing, so calendar linking is unavailable here.</p>
            ) : null}
            {hasGoogleCalendarAccess ? (
              <p>
                Your Google Calendar account is connected with calendar scopes and ready for automatic scheduling.
              </p>
            ) : (
              <>
                <p>
                  Connect your Google account so Lloyd&apos;s can check free/busy and create events during matching.
                </p>
                <form action={connectGoogleCalendarAction}>
                  <button type="submit" className="lloyds-button" disabled={!env.hasGoogleOAuth}>
                    Link Google Calendar
                  </button>
                </form>
              </>
            )}
          </section>

          <section className="panel">
            <h2>Appointment Schedules</h2>
            {scheduleCopy[scheduleKey] ? <Flash tone="success" message={scheduleCopy[scheduleKey]} /> : null}
            <p>
              Automatic scheduling uses one linked appointment schedule as your default source of booking
              availability.
            </p>
            <div className="button-row">
              <a href={creationUrl} target="_blank" rel="noreferrer" className="lloyds-button-secondary">
                Create in Google Calendar
              </a>
            </div>

            {schedules.length === 0 ? (
              <p>No appointment schedules linked yet.</p>
            ) : (
              <div className="settings-schedule-list">
                {schedules.map((schedule) => (
                  <article className="lloyds-card settings-schedule-card" key={schedule.id}>
                    <div className="settings-schedule-header">
                      <h3>{schedule.label}</h3>
                      {schedule.isActive ? <span className="lloyds-pill status-pill">Active</span> : null}
                    </div>
                    <p>
                      <a href={schedule.bookingPageUrl} target="_blank" rel="noreferrer">
                        {schedule.bookingPageUrl}
                      </a>
                    </p>
                    <div className="button-row">
                      {!schedule.isActive ? (
                        <form action={activateAppointmentScheduleAction}>
                          <input type="hidden" name="scheduleId" value={schedule.id} />
                          <button type="submit" className="lloyds-button-secondary">
                            Use for Scheduling
                          </button>
                        </form>
                      ) : null}
                      <form action={unlinkAppointmentScheduleAction}>
                        <input type="hidden" name="scheduleId" value={schedule.id} />
                        <button type="submit" className="lloyds-button-secondary">
                          Unlink
                        </button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <form action={linkAppointmentScheduleAction} className="form-grid">
              <label htmlFor="label">
                Schedule Label
                <input id="label" name="label" type="text" placeholder="Weekday Office Hours" />
              </label>

              <label htmlFor="bookingPageUrl">
                Appointment Booking Page URL
                <input
                  id="bookingPageUrl"
                  name="bookingPageUrl"
                  type="url"
                  placeholder="https://calendar.app.google/..."
                  required
                />
              </label>

              <button type="submit" className="lloyds-button" disabled={!hasGoogleCalendarAccess}>
                Link Appointment Schedule
              </button>
            </form>
          </section>
        </div>

        <aside className="lloyds-page">
          <section className="panel">
            <h2>Current Scheduling Mode</h2>
            <p>
              {hasGoogleCalendarAccess
                ? "Google Calendar is connected."
                : "Google Calendar is not linked yet."}
            </p>
            <p>
              {activeSchedule
                ? `Active appointment schedule: ${activeSchedule.label}`
                : "No active appointment schedule selected."}
            </p>
          </section>

          <section className="panel">
            <h2>How This Works</h2>
            <ul className="list-clean">
              <li>Connect Google once to authorize scheduling automation.</li>
              <li>Create appointment schedules directly in Google Calendar.</li>
              <li>Link one or more booking pages here and mark one as active.</li>
              <li>Update your availability in Google and keep one stable booking link.</li>
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}
