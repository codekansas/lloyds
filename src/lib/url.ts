export const normalizeUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl.trim());
  parsed.hash = "";

  if (parsed.pathname !== "/") {
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
  }

  const entries = [...parsed.searchParams.entries()].filter(([key]) => !key.startsWith("utm_"));
  parsed.search = "";
  for (const [key, value] of entries.sort((a, b) => a[0].localeCompare(b[0]))) {
    parsed.searchParams.append(key, value);
  }

  return parsed.toString();
};

export const getDomainFromUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  return parsed.hostname.replace(/^www\./, "");
};
