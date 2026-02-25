export const constitutionGistId = "1f5b9bd7e4ca1332f667f0e04323ee5b";
export const constitutionGistUrl = `https://gist.github.com/codekansas/${constitutionGistId}`;
const constitutionGistApiUrl = `https://api.github.com/gists/${constitutionGistId}`;

const successfulFetchCacheTtlMs = 24 * 60 * 60 * 1000;
const fallbackCacheTtlMs = 60 * 60 * 1000;

type CachedConstitution = {
  text: string;
  fetchedAt: number;
  source: "gist" | "fallback";
};

const cacheTtlMsForSource = (source: CachedConstitution["source"]): number => {
  if (source === "gist") {
    return successfulFetchCacheTtlMs;
  }
  return fallbackCacheTtlMs;
};

let cachedConstitution: CachedConstitution | null = null;

const fallbackConstitutionText = `# Lloyd's List Constitution

Version 2026-02-23

This constitution defines how article quality is judged in Lloyd's List. Lloyd's List is a discovery engine for scientific, programming, engineering, and startup ideas. It rewards technical depth, novelty, and practical insight while discouraging hype, tribal framing, and low-signal discourse.

## Editorial Scope

Prioritize work that materially improves understanding in one or more of these areas:

- Software engineering, programming languages, systems, databases, networking, security, and hardware.
- AI/ML, data science, and computational methods with concrete technical detail.
- Scientific and engineering analysis grounded in reproducible evidence.
- Startup building, product execution, and company-building lessons with operational specifics.
- Technical essays that introduce useful models, design patterns, or failure analyses.

### Explicit Deprioritization

Strongly deprioritize content where politics, culture war, ideology, or emotional arousal is the primary payload and technical/scientific substance is secondary.

- Pure political commentary, electoral speculation, outrage cycles, and partisan rhetoric should score low.
- Policy or regulation posts are allowed only when they contain substantial technical or scientific analysis.
- Social-media drama, personality feuds, and controversy farming should be treated as low quality.
- Overtly emotional framing (rage-bait, fear appeals, moral grandstanding, identity signaling, or tribal dunking) should be treated as a major penalty.
- If politics/emotion-first framing dominates and technical detail is thin, cap ratings at Common Rumour or Merchant's Word.

## Core Principles

1. Technical depth over surface commentary.
2. Evidence over assertion.
3. Original insight over recycled consensus.
4. Practical transfer over abstract posturing.
5. Clarity over obscurity.
6. Honest uncertainty over false certainty.
7. Signal density over hot takes.

## Rating Criteria

Evaluate every article on these dimensions:

- Technical depth: level of detail, mechanism explanation, and whether claims survive expert scrutiny.
- Novelty and insight: genuinely new ideas, non-obvious synthesis, or meaningful contrarian analysis.
- Evidence quality: cited data, experiments, benchmarks, primary sources, and reproducibility.
- Reasoning quality: explicit assumptions, causal structure, alternatives considered, and counterexample handling.
- Practical value: concrete lessons a serious builder/researcher can apply to decisions or implementation.
- Epistemic conduct: calibrated confidence, uncertainty disclosure, and correction of limitations.
- Writing quality: coherence, precision, and ratio of signal to filler.

## Penalties

Downgrade heavily for:

- Politics-first or ideology-first framing with weak technical substance.
- Overtly emotional, inflammatory, or manipulative framing that substitutes for evidence.
- Clickbait framing, outrage bait, or controversy farming.
- Unverifiable claims presented as facts.
- Sweeping conclusions with weak or missing evidence.
- Generic summaries that avoid mechanism-level detail.
- Repackaged consensus with little new understanding.
- Excessive self-promotion, affiliate spam, or engagement farming.
- AI slop patterns: generic platitudes, shallow summaries, and no concrete argument.

## Bonuses

Upgrade when present:

- New mental models, original experiments, or benchmark-backed conclusions.
- Code-level, architectural, mathematical, or scientific detail that increases transferability.
- Clear treatment of tradeoffs, failure modes, and operational constraints.
- Durable insights likely to remain useful beyond a short news cycle.

## Quality Scale

Pick exactly one rating:

1. Common Rumour
   - Mostly shallow, derivative, speculative, or politics-driven.
   - Little technical evidence or reusable insight.
   - Weak signal, mainly for awareness.

2. Merchant's Word
   - Plausible and somewhat useful, but limited technical depth.
   - Partial evidence with modest novelty.
   - Useful for orientation, not implementation.

3. Captain's Account
   - Clear thesis, credible evidence, and meaningful technical discussion.
   - Demonstrates reasonable novelty or synthesis.
   - Reliable for discussion and medium-stakes decisions.

4. Underwriter's Confidence
   - Strong sourcing, disciplined reasoning, and dense technical signal.
   - Materially improves expert mental models or implementation decisions.
   - Suitable for high-stakes technical or strategic use.

5. The Lloyd's Assurance
   - Exceptional rigor, originality, and practical consequence.
   - Introduces or validates ideas that meaningfully advance the field.
   - Stands up to adversarial scrutiny and remains durable over time.

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

- A detailed checklist pass over the key dimensions (scope fit, technical depth, novelty, evidence quality, reasoning quality, practical value, clarity, and penalties).
- One rating from the five-level scale after completing the checklist.
- A thoughtful 5-6 sentence explanation of how the checklist led to the selected rating.
- No mention of popularity metrics (karma, likes, shares) as quality evidence.
- If relevant, note that politics-first framing reduced the score due to poor technical focus.
- If relevant, explicitly note when overt emotional framing triggered a major penalty.
`;

const localConstitutionAddendumHeader = "## Local Enforcement Addendum";
const localConstitutionAddendum = `
${localConstitutionAddendumHeader}

These rules are strict and override ambiguity in source material:

- Strongly deprioritize political and overtly emotional content unless the technical/scientific analysis is clearly dominant.
- If an article is mainly politics-first or emotion-first with limited technical evidence, do not rate above Merchant's Word.
- If emotional or partisan rhetoric is central and technical depth is weak, prefer Common Rumour.
- In qualityChecklist.penalties and qualityRationale, explicitly state when this penalty affected the final score.
`.trim();

const withLocalConstitutionAddendum = (text: string): string => {
  if (text.includes(localConstitutionAddendumHeader)) {
    return text;
  }

  return `${text.trim()}\n\n${localConstitutionAddendum}\n`;
};

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
  if (cachedConstitution && now - cachedConstitution.fetchedAt < cacheTtlMsForSource(cachedConstitution.source)) {
    return {
      text: cachedConstitution.text,
      source: cachedConstitution.source,
      referenceUrl: constitutionGistUrl,
    };
  }

  try {
    const text = withLocalConstitutionAddendum(await fetchConstitutionFromGist());
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
    const fallbackText = withLocalConstitutionAddendum(fallbackConstitutionText);
    cachedConstitution = {
      text: fallbackText,
      fetchedAt: now,
      source: "fallback",
    };

    return {
      text: fallbackText,
      source: "fallback",
      referenceUrl: constitutionGistUrl,
    };
  }
};

export const defaultConstitutionText = withLocalConstitutionAddendum(fallbackConstitutionText);
