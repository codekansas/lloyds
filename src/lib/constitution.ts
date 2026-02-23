export const constitutionGistId = "1f5b9bd7e4ca1332f667f0e04323ee5b";
export const constitutionGistUrl = `https://gist.github.com/codekansas/${constitutionGistId}`;
const constitutionGistApiUrl = `https://api.github.com/gists/${constitutionGistId}`;

const cacheTtlMs = 60 * 60 * 1000;

type CachedConstitution = {
  text: string;
  fetchedAt: number;
  source: "gist" | "fallback";
};

let cachedConstitution: CachedConstitution | null = null;

const fallbackConstitutionText = `# Lloyd's List Constitution

Version 2026-02-23

This constitution defines how article quality is judged in Lloyd's List. It exists to reward epistemic rigor, practical usefulness, and honest uncertainty while discouraging hype and empty rhetoric.

## Core Principles

1. Truth over virality.
2. Evidence over assertion.
3. Clarity over obscurity.
4. Original thought over recycled consensus.
5. Decision usefulness over entertainment value.
6. Honest uncertainty over false certainty.
7. Civil disagreement over tribal signaling.

## Rating Criteria

Evaluate every article on these dimensions:

- Evidence quality: cited data, direct sources, reproducibility, and distinction between facts and speculation.
- Reasoning quality: explicit assumptions, causal logic, steelmanning, and handling of counterarguments.
- Informational value: novelty, synthesis quality, and whether the reader learns something consequential.
- Practical value: decision relevance, concrete takeaways, and transferability to real-world choices.
- Epistemic conduct: calibrated confidence, transparency about uncertainty, and avoidance of manipulative framing.
- Writing quality: coherence, precision, and ratio of signal to filler.

## Penalties

Downgrade heavily for:

- Clickbait framing or outrage bait.
- Unverifiable claims presented as facts.
- Sweeping conclusions with weak or missing evidence.
- Ideological one-sidedness that ignores plausible alternatives.
- Excessive self-promotion, affiliate spam, or engagement farming.
- AI slop patterns: generic platitudes, shallow summaries, and no concrete argument.

## Quality Scale

Pick exactly one rating:

1. Common Rumour
  - Mostly unverified, derivative, or speculative.
  - Weak sourcing and low decision value.
  - May still be worth tracking as weak signal.

2. Merchant's Word
  - Plausible and somewhat useful, but limited depth.
  - Partial evidence and moderate rigor.
  - Useful for orientation, not for high-stakes decisions.

3. Captain's Account
  - Clear thesis, credible evidence, and practical insights.
  - Good faith treatment of uncertainty and alternatives.
  - Reliable basis for discussion and medium-stakes decisions.

4. Underwriter's Confidence
  - Strong sourcing, disciplined reasoning, and high signal density.
  - Materially improves a serious reader's models or decisions.
  - Suitable for high-stakes strategic consideration.

5. The Lloyd's Assurance
  - Exceptional rigor, originality, and practical consequence.
  - Stands up to adversarial scrutiny and remains useful over time.
  - Rare benchmark-quality analysis.

## Distribution Targets

Over a large set of links, ratings should be approximately:

- Common Rumour: 20%
- Merchant's Word: 30%
- Captain's Account: 30%
- Underwriter's Confidence: 15%
- The Lloyd's Assurance: 5%

Do not force quotas in a tiny batch. Use these targets for calibration when uncertain.

## Output Requirement for AI Raters

When rating an article, provide:

- One rating from the five-level scale.
- A short rationale tied to evidence, reasoning, and practical value.
- No mention of popularity metrics (karma, likes, shares) as quality evidence.
`;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const extractTextFromGistPayload = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const filesValue = payload.files;
  if (!isRecord(filesValue)) {
    return null;
  }

  for (const entry of Object.values(filesValue)) {
    if (!isRecord(entry)) {
      continue;
    }

    const content = entry.content;
    if (typeof content === "string" && content.trim().length > 100) {
      return content;
    }

    const rawUrl = entry.raw_url;
    if (typeof rawUrl === "string" && rawUrl.startsWith("http")) {
      return rawUrl;
    }
  }

  return null;
};

const fetchConstitutionFromGist = async (): Promise<string> => {
  const response = await fetch(constitutionGistApiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "lloyds-feed-bot",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch constitution gist: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const extracted = extractTextFromGistPayload(payload);

  if (!extracted) {
    throw new Error("Constitution gist had no readable file content.");
  }

  if (extracted.startsWith("http")) {
    const rawResponse = await fetch(extracted, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!rawResponse.ok) {
      throw new Error(`Unable to fetch constitution raw file: ${rawResponse.status}`);
    }

    const rawText = await rawResponse.text();
    if (rawText.trim().length < 100) {
      throw new Error("Constitution raw file was too short.");
    }

    return rawText;
  }

  return extracted;
};

export const getConstitutionText = async (): Promise<{
  text: string;
  source: "gist" | "fallback";
  referenceUrl: string;
}> => {
  const now = Date.now();
  if (cachedConstitution && now - cachedConstitution.fetchedAt < cacheTtlMs) {
    return {
      text: cachedConstitution.text,
      source: cachedConstitution.source,
      referenceUrl: constitutionGistUrl,
    };
  }

  try {
    const text = await fetchConstitutionFromGist();
    cachedConstitution = {
      text,
      fetchedAt: now,
      source: "gist",
    };

    return {
      text,
      source: "gist",
      referenceUrl: constitutionGistUrl,
    };
  } catch {
    cachedConstitution = {
      text: fallbackConstitutionText,
      fetchedAt: now,
      source: "fallback",
    };

    return {
      text: fallbackConstitutionText,
      source: "fallback",
      referenceUrl: constitutionGistUrl,
    };
  }
};

export const defaultConstitutionText = fallbackConstitutionText;
