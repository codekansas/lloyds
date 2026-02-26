import type { Metadata } from "next";

import { LocalTimestamp, LocalTimezoneLabel } from "@/components/local-timestamp";
import { formatMinutesAsAge, getServiceStatusSnapshot, serviceStateLabels } from "@/lib/service-status";

export const metadata: Metadata = {
  title: "System Status | Lloyd's Coffee House",
  description: "Operational status for RSS ingestion, post summarization, and supporting services.",
};

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const snapshot = await getServiceStatusSnapshot();
  const queue = snapshot.summaryQueue;

  return (
    <section className="layout-stack">
      <header className="masthead">
        <h1>System Status</h1>
        <p>Live health of ingestion, summarization, and supporting services.</p>
      </header>

      <article className="surface status-overview-panel">
        <div className="status-overview-header">
          <strong>Overall status</strong>
          <span className="chip status-state-pill" data-state={snapshot.overallState}>
            {serviceStateLabels[snapshot.overallState]}
          </span>
        </div>

        <div className="inline-cluster">
          <span className="chip">Pending summaries: {queue.pendingCount ?? "unknown"}</span>
          <span className="chip">Retryable failures: {queue.failedCount ?? "unknown"}</span>
          <span className="chip">
            Timezone: <LocalTimezoneLabel />
          </span>
          <span className="chip">
            Oldest pending age: {queue.oldestPendingAgeMinutes === null ? "none" : formatMinutesAsAge(queue.oldestPendingAgeMinutes)}
          </span>
          <span className="chip">
            Last snapshot: <LocalTimestamp iso={snapshot.generatedAt} />
          </span>
        </div>
      </article>

      <div className="status-services-grid">
        {snapshot.services.map((service) => (
          <article key={service.id} className={`surface status-service-card status-service-card-${service.state}`}>
            <div className="status-service-header">
              <h2>{service.name}</h2>
              <span className="chip status-state-pill" data-state={service.state}>
                {serviceStateLabels[service.state]}
              </span>
            </div>
            <p className="status-service-summary">{service.summary}</p>
            <ul className="list-reset status-service-details">
              {service.details.length === 0 ? <li>No additional details available.</li> : null}
              {service.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
            {service.id === "rss-ingestion" && service.staleSources && service.staleSources.length > 0 ? (
              <details className="status-stale-sources">
                <summary className="text-label status-stale-sources-summary">
                  Stale feed sources ({service.staleSources.length})
                </summary>
                <ul className="list-reset status-stale-sources-list">
                  {service.staleSources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer noopener">
                        {source.url}
                      </a>
                      <span>
                        {source.lastFetchedAt ? (
                          <>
                            Last fetched {formatMinutesAsAge(source.staleAgeMinutes)} ago (<LocalTimestamp iso={source.lastFetchedAt} />).
                          </>
                        ) : (
                          "Never fetched successfully."
                        )}
                        {source.failureCount > 0 ? ` Failure count: ${source.failureCount}.` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="text-label status-service-updated">
              Updated: <LocalTimestamp iso={service.updatedAt} />
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
