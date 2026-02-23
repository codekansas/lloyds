export const normalizeUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl.trim());
  parsed.hash = "";
  parsed.hostname = parsed.hostname.replace(/^www\./i, "");

  const isWebProtocol = parsed.protocol === "http:" || parsed.protocol === "https:";
  const hasNoPort = parsed.port === "";
  const isDefaultPort =
    (parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443");

  if (isWebProtocol && (hasNoPort || isDefaultPort)) {
    parsed.protocol = "https:";
    parsed.port = "";
  }

  if (parsed.pathname !== "/") {
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
  }

  const entries = [...parsed.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith("utm_"))
    .sort(([keyA, valueA], [keyB, valueB]) => {
      const keyComparison = keyA.localeCompare(keyB);
      return keyComparison === 0 ? valueA.localeCompare(valueB) : keyComparison;
    });
  parsed.search = "";
  for (const [key, value] of entries) {
    parsed.searchParams.append(key, value);
  }

  return parsed.toString();
};

export const getDomainFromUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  return parsed.hostname.replace(/^www\./, "");
};
