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

const summarySchema = z.object({
  bullets: z.array(z.string().min(8).max(220)).min(4).max(8),
  readSeconds: z.number().int().min(10).max(30),
  qualityRating: z.enum(articleQualityRatingValues),
  qualityRationale: z.string().min(24).max(320),
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

const fallbackSummarize = (title: string, articleUrl: string, articleText: string): SummaryResult => {
  const sentences = articleText
    .split(/(?<=[.!?])\s+/)
    .map(cleanSentence)
    .filter((sentence) => sentence.length > 45)
    .slice(0, 6);

  const bullets = [
    `Core thesis: ${title}.`,
    ...sentences.slice(0, 4).map((sentence) => sentence.slice(0, 180)),
  ].slice(0, 6);
  const qualityRating = assignQualityRatingFromHash(articleUrl);

  return {
    bullets,
    readSeconds: Math.max(10, Math.min(30, Math.round((bullets.join(" ").split(" ").length / 220) * 60))),
    qualityRating,
    qualityRationale: `Fallback calibration assigned ${qualityLabelFromRating(qualityRating)} pending constitutional model review.`,
    model: "fallback-extractive-v1",
  };
};

const parseSummaryJson = (rawText: string): SummaryResult | null => {
  try {
    const parsed = JSON.parse(rawText);
    const validated = summarySchema.parse(parsed);
    return {
      bullets: validated.bullets,
      readSeconds: validated.readSeconds,
      qualityRating: validated.qualityRating,
      qualityRationale: validated.qualityRationale,
      model: env.openAiModel,
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
  const prompt = [
    "You create rapid pre-read summaries for thoughtful readers.",
    "Output strict JSON only with this schema:",
    '{"bullets": string[4-8], "readSeconds": integer(10-30), "qualityRating": enum, "qualityRationale": string}',
    "Bullets must capture argument, evidence, assumptions, and one potential weakness.",
    "Each bullet should be 10-24 words and concrete.",
    "Quality rating must follow the Lloyd's Constitution exactly.",
    "Choose qualityRating from this exact enum:",
    articleQualityRatingValues.join(", "),
    "Keep distribution roughly calibrated over many links:",
    articleQualityScalePrompt,
    "qualityRationale must be one sentence under 40 words, tied to evidence quality, reasoning quality, and practical value.",
    "No markdown, no numbering, no extra keys.",
    "--- Constitution Reference ---",
    `Canonical URL: ${constitution.referenceUrl}`,
    `Loaded from: ${constitution.source}`,
    constitution.text,
    "---",
    `Title: ${title}`,
    `URL: ${articleUrl}`,
    `Article:\n${articleText}`,
  ].join("\n");

  try {
    const response = await openAiClient.responses.create({
      model: env.openAiModel,
      input: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_output_tokens: 600,
      temperature: 0.2,
    });

    const parsed = parseSummaryJson(response.output_text);
    if (parsed) {
      return parsed;
    }
  } catch {
    // Fall through to deterministic summary generation.
  }

  return fallbackSummarize(title, articleUrl, articleText);
};
