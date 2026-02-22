import { z } from "zod";

import { openAiClient } from "@/lib/ai";
import { env } from "@/lib/env";

const summarySchema = z.object({
  bullets: z.array(z.string().min(8).max(220)).min(4).max(8),
  readSeconds: z.number().int().min(10).max(30),
});

export type SummaryResult = {
  bullets: string[];
  readSeconds: number;
  model: string;
};

const cleanSentence = (value: string): string => {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\-•\d\.\)\s]+/, "")
    .trim();
};

const fallbackSummarize = (title: string, articleText: string): SummaryResult => {
  const sentences = articleText
    .split(/(?<=[.!?])\s+/)
    .map(cleanSentence)
    .filter((sentence) => sentence.length > 45)
    .slice(0, 6);

  const bullets = [
    `Core thesis: ${title}.`,
    ...sentences.slice(0, 4).map((sentence) => sentence.slice(0, 180)),
  ].slice(0, 6);

  return {
    bullets,
    readSeconds: Math.max(10, Math.min(30, Math.round((bullets.join(" ").split(" ").length / 220) * 60))),
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
    return fallbackSummarize(title, articleText);
  }

  const prompt = [
    "You create rapid pre-read summaries for thoughtful readers.",
    "Output strict JSON only with this schema:",
    '{"bullets": string[4-8], "readSeconds": integer(10-30)}',
    "Bullets must capture argument, evidence, assumptions, and one potential weakness.",
    "Each bullet should be 10-24 words and concrete.",
    "No markdown, no numbering, no extra keys.",
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

  return fallbackSummarize(title, articleText);
};
