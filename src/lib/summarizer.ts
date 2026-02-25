import { z } from "zod";
import type { ArticleQualityRating } from "@prisma/client";

import {
  articleQualityScalePrompt,
  articleQualityRatingValues,
  assignQualityRatingFromHash,
  qualityLabelFromRating,
} from "@/lib/article-quality";
import { openAiClient } from "@/lib/ai";
import { getConstitutionText } from "@/lib/constitution";
import { env } from "@/lib/env";

const qualityChecklistSchema = z.object({
  scopeFit: z.string().min(8).max(180),
  technicalDepth: z.string().min(8).max(180),
  novelty: z.string().min(8).max(180),
  evidenceQuality: z.string().min(8).max(180),
  reasoningQuality: z.string().min(8).max(180),
  practicalValue: z.string().min(8).max(180),
  clarity: z.string().min(8).max(180),
  penalties: z.string().min(8).max(180),
});

const summarySchema = z.object({
  bullets: z.array(z.string().min(8).max(220)).min(4).max(8),
  readSeconds: z.number().int().min(10).max(30),
  qualityRating: z.enum(articleQualityRatingValues),
  qualityChecklist: qualityChecklistSchema.optional(),
  qualityRationale: z.string().min(24).max(1200),
});

export type SummaryResult = {
  bullets: string[];
  readSeconds: number;
  qualityRating: ArticleQualityRating;
  qualityRationale: string;
  model: string;
};

const cleanSentence = (value: string): string => {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\-•\d\.\)\s]+/, "")
    .trim();
};

const trimToMax = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const normalizeArticleText = (value: string): string => {
  return value
    .replace(/\r/g, "\n")
    .replace(/^\s*url source:.*$/gim, " ")
    .replace(/^\s*markdown content:\s*/gim, " ")
    .replace(/^\s*=+\s*$/gm, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const sanitizeSummaryBullet = (value: string): string => {
  const normalized = normalizeArticleText(value)
    .replace(/\b(url source|markdown content)\b:?/gi, " ")
    .replace(/={2,}/g, " ")
    .replace(/\s+/g, " ");

  return trimToMax(cleanSentence(normalized), 220);
};

const dedupeBullets = (bullets: string[]): string[] => {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const bullet of bullets) {
    const key = bullet.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(bullet);
  }

  return deduped;
};

const normalizeSummaryBullets = (bullets: string[]): string[] => {
  const cleaned = bullets
    .map((bullet) => sanitizeSummaryBullet(bullet))
    .filter((bullet) => bullet.length >= 24);

  return dedupeBullets(cleaned).slice(0, 8);
};

const summarizeChecklistForRationale = (checklist: z.infer<typeof qualityChecklistSchema>): string => {
  const checklistSummary = [
    `Scope fit: ${cleanSentence(checklist.scopeFit)}`,
    `Depth: ${cleanSentence(checklist.technicalDepth)}`,
    `Novelty: ${cleanSentence(checklist.novelty)}`,
    `Evidence: ${cleanSentence(checklist.evidenceQuality)}`,
    `Reasoning: ${cleanSentence(checklist.reasoningQuality)}`,
    `Practical value: ${cleanSentence(checklist.practicalValue)}`,
  ];

  const normalizedPenalty = cleanSentence(checklist.penalties);
  if (!/^(none|n\/a|no material|no major)/i.test(normalizedPenalty)) {
    checklistSummary.push(`Penalties: ${normalizedPenalty}`);
  }

  return trimToMax(checklistSummary.join(" "), 260);
};

const buildQualityRationale = ({
  qualityRationale,
  qualityChecklist,
}: {
  qualityRationale: string;
  qualityChecklist?: z.infer<typeof qualityChecklistSchema>;
}): string => {
  const normalizedRationale = trimToMax(cleanSentence(qualityRationale), 960);

  if (!qualityChecklist) {
    return normalizedRationale;
  }

  const checklistSummary = summarizeChecklistForRationale(qualityChecklist);
  return trimToMax(`${normalizedRationale}\n\nChecklist signals: ${checklistSummary}`, 1200);
};

const fallbackSummarize = (title: string, articleUrl: string, articleText: string): SummaryResult => {
  const normalizedArticleText = normalizeArticleText(articleText);
  const sentences = normalizedArticleText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sanitizeSummaryBullet(sentence))
    .filter((sentence) => {
      if (sentence.length < 48 || sentence.length > 220) {
        return false;
      }

      return !/(cookie|privacy policy|subscribe|sign in|table of contents|skip to content)/i.test(sentence);
    })
    .slice(0, 6);

  const fallbackBullets = [
    `Core thesis: ${title}.`,
    ...sentences.slice(0, 5),
  ].slice(0, 6);
  const normalizedBullets = normalizeSummaryBullets(fallbackBullets);
  const bullets = normalizedBullets.length >= 4
    ? normalizedBullets
    : [
        `Core thesis: ${sanitizeSummaryBullet(title)}.`,
        "The retrieved text suggests technical content, but source extraction quality was limited.",
        "Method and evidence details should be verified directly in the original article.",
        "Use this brief as provisional context until a full model summary succeeds.",
      ];
  const qualityRating = assignQualityRatingFromHash(articleUrl);

  return {
    bullets,
    readSeconds: Math.max(10, Math.min(30, Math.round((bullets.join(" ").split(" ").length / 220) * 60))),
    qualityRating,
    qualityRationale: `Checklist review unavailable in fallback mode. Provisional calibration assigned ${qualityLabelFromRating(qualityRating)} until constitutional scoring succeeds.`,
    model: "fallback-extractive-v1",
  };
};

const parseSummaryJson = (rawText: string, model: string): SummaryResult | null => {
  const extractJsonObject = (value: string): string | null => {
    const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidates = [value, fencedMatch?.[1] ?? ""].filter((candidate) => candidate.trim().length > 0);

    for (const candidate of candidates) {
      const trimmed = candidate.trim();
      const firstBraceIdx = trimmed.indexOf("{");
      const lastBraceIdx = trimmed.lastIndexOf("}");
      if (firstBraceIdx === -1 || lastBraceIdx <= firstBraceIdx) {
        continue;
      }

      return trimmed.slice(firstBraceIdx, lastBraceIdx + 1);
    }

    return null;
  };
  try {
    const jsonPayload = extractJsonObject(rawText);
    if (!jsonPayload) {
      return null;
    }

    const parsed = JSON.parse(jsonPayload);
    const validated = summarySchema.parse(parsed);
    const normalizedBullets = normalizeSummaryBullets(validated.bullets);

    if (normalizedBullets.length < 4) {
      return null;
    }

    return {
      bullets: normalizedBullets,
      readSeconds: validated.readSeconds,
      qualityRating: validated.qualityRating,
      qualityRationale: buildQualityRationale({
        qualityChecklist: validated.qualityChecklist,
        qualityRationale: validated.qualityRationale,
      }),
      model,
    };
  } catch {
    return null;
  }
};

export const summarizeArticle = async (
  title: string,
  articleUrl: string,
  articleText: string,
): Promise<SummaryResult> => {
  if (!openAiClient) {
    return fallbackSummarize(title, articleUrl, articleText);
  }

  const constitution = await getConstitutionText();
  const gradingModel = env.constitutionGraderModel;
  const normalizedArticleText = normalizeArticleText(articleText);
  const prompt = [
    "You create rapid pre-read summaries for thoughtful readers.",
    "Output strict JSON only with this schema:",
    '{"bullets": string[4-8], "readSeconds": integer(10-30), "qualityRating": enum, "qualityChecklist": {scopeFit: string, technicalDepth: string, novelty: string, evidenceQuality: string, reasoningQuality: string, practicalValue: string, clarity: string, penalties: string}, "qualityRationale": string}',
    "Bullets must capture argument, evidence, assumptions, and one potential weakness.",
    "Each bullet should be 10-24 words and concrete.",
    "Quality rating must follow the Lloyd's Constitution exactly.",
    "Before picking qualityRating, complete the qualityChecklist fields as your reasoning trace ('show your work').",
    "Each checklist field should be concise (6-18 words) and grounded in the article text.",
    "Choose qualityRating from this exact enum:",
    articleQualityRatingValues.join(", "),
    "Keep distribution roughly calibrated over many links:",
    articleQualityScalePrompt,
    "Strongly deprioritize political or overtly emotional content when technical/scientific substance is secondary.",
    "If politics/emotion-first framing dominates and technical depth is weak, score Common Rumour.",
    "Do not score above Merchant's Word for politics/emotion-heavy content unless technical analysis is clearly dominant.",
    "When this penalty applies, explicitly mention it in qualityChecklist.penalties and qualityRationale.",
    "qualityRationale must be 5-6 complete sentences (roughly 90-170 words) that explain how the checklist reasoning led to the final rating.",
    "No markdown, no numbering, no extra keys.",
    "--- Constitution Reference ---",
    `Canonical URL: ${constitution.referenceUrl}`,
    `Loaded from: ${constitution.source}`,
    constitution.text,
    "---",
    `Title: ${title}`,
    `URL: ${articleUrl}`,
    `Article:\n${normalizedArticleText}`,
  ].join("\n");

  try {
    const response = await openAiClient.responses.create({
      model: gradingModel,
      input: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_output_tokens: 1200,
      temperature: 0.2,
    });

    const parsed = parseSummaryJson(response.output_text, gradingModel);
    if (parsed) {
      return parsed;
    }
  } catch {
    // Fall through to deterministic summary generation.
  }

  return fallbackSummarize(title, articleUrl, articleText);
};
