"use client";

const utcFallbackFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const localFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const formatUtcFallback = (iso: string): string => {
  const value = new Date(iso);
  if (Number.isNaN(value.valueOf())) {
    return iso;
  }

  return utcFallbackFormatter.format(value);
};

const formatLocalTimestamp = (iso: string): string => {
  const value = new Date(iso);
  if (Number.isNaN(value.valueOf())) {
    return iso;
  }

  return localFormatter.format(value);
};

type LocalTimestampProps = {
  iso: string;
};

export const LocalTimestamp = ({ iso }: LocalTimestampProps) => {
  const formatted = typeof window === "undefined" ? formatUtcFallback(iso) : formatLocalTimestamp(iso);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {formatted}
    </time>
  );
};

export const LocalTimezoneLabel = () => {
  const timezone =
    typeof window === "undefined" ? "UTC" : (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");

  return <span suppressHydrationWarning>{timezone}</span>;
};
