const MAX_CHARS = 18_000;

const limitText = (value: string): string => {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
};

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LloydsCoffeeHouseBot/1.0 (+https://lloyds.coffee)",
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
};

const fetchViaJinaReader = async (articleUrl: string): Promise<string | null> => {
  const normalized = articleUrl.replace(/^https?:\/\//, "");
  const readerUrl = `https://r.jina.ai/http://${normalized}`;

  try {
    const response = await fetchWithTimeout(readerUrl, 15_000);
    if (!response.ok) {
      return null;
    }

    const text = limitText(await response.text());
    if (text.length < 500) {
      return null;
    }

    return text;
  } catch {
    return null;
  }
};

const stripHtml = (html: string): string => {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
};

const fetchViaRawHtml = async (articleUrl: string): Promise<string | null> => {
  try {
    const response = await fetchWithTimeout(articleUrl, 15_000);
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const text = limitText(stripHtml(html));
    return text.length < 500 ? null : text;
  } catch {
    return null;
  }
};

export const fetchArticleText = async (articleUrl: string, fallbackText: string | null): Promise<string> => {
  const fromJina = await fetchViaJinaReader(articleUrl);
  if (fromJina) {
    return fromJina;
  }

  const fromRawHtml = await fetchViaRawHtml(articleUrl);
  if (fromRawHtml) {
    return fromRawHtml;
  }

  return limitText(fallbackText ?? articleUrl);
};
