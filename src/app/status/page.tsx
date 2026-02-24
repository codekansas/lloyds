import type { Metadata } from "next";

import { formatMinutesAsAge, getServiceStatusSnapshot, serviceStateLabels, type ServiceState } from "@/lib/service-status";

export const metadata: Metadata = {
  title: "System Status | Lloyd's Coffee House",
  description: "Operational status for RSS ingestion, post summarization, and supporting services.",
};

export const dynamic = "force-dynamic";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatTimestamp = (iso: string): string => {
  return timestampFormatter.format(new Date(iso));
};

const statusPillClassNames: Record<ServiceState, string> = {
  operational: "status-state-pill-operational",
  degraded: "status-state-pill-degraded",
  outage: "status-state-pill-outage",
};

export default async function StatusPage() {
  const snapshot = await getServiceStatusSnapshot();
  const queue = snapshot.summaryQueue;

  return (
    <section className="lloyds-page">
      <header className="masthead">
        <h1>System Status</h1>
        <p>Live health of ingestion, summarization, and supporting services.</p>
      </header>

      <article className="panel status-overview-panel">
        <div className="status-overview-header">
          <strong>Overall status</strong>
          <span className={`lloyds-pill status-state-pill ${statusPillClassNames[snapshot.overallState]}`}>
            {serviceStateLabels[snapshot.overallState]}
          </span>
        </div>

        <div className="status-overview-metrics">
          <span className="lloyds-pill">Pending summaries: {queue.pendingCount ?? "unknown"}</span>
          <span className="lloyds-pill">Failed summaries: {queue.failedCount ?? "unknown"}</span>
          <span className="lloyds-pill">
            Oldest pending age: {queue.oldestPendingAgeMinutes === null ? "none" : formatMinutesAsAge(queue.oldestPendingAgeMinutes)}
          </span>
          <span className="lloyds-pill">Last snapshot: {formatTimestamp(snapshot.generatedAt)}</span>
        </div>
      </article>

      <div className="status-services-grid">
        {snapshot.services.map((service) => (
          <article key={service.id} className={`panel status-service-card status-service-card-${service.state}`}>
            <div className="status-service-header">
              <h2>{service.name}</h2>
              <span className={`lloyds-pill status-state-pill ${statusPillClassNames[service.state]}`}>
                {serviceStateLabels[service.state]}
              </span>
            </div>
            <p className="status-service-summary">{service.summary}</p>
            <ul className="list-clean status-service-details">
              {service.details.length === 0 ? <li>No additional details available.</li> : null}
              {service.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
            {service.id === "rss-ingestion" && service.staleSources && service.staleSources.length > 0 ? (
              <div className="status-stale-sources">
                <p className="lloyds-label status-stale-sources-title">Stale feed sources</p>
                <ul className="list-clean status-stale-sources-list">
                  {service.staleSources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer noopener">
                        {source.url}
                      </a>
                      <span>
                        {source.lastFetchedAt
                          ? `Last fetched ${formatMinutesAsAge(source.staleAgeMinutes)} ago (${formatTimestamp(source.lastFetchedAt)}).`
                          : "Never fetched successfully."}
                        {source.failureCount > 0 ? ` Failure count: ${source.failureCount}.` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="lloyds-label status-service-updated">Updated: {formatTimestamp(service.updatedAt)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
