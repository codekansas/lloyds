import { z } from "zod";
import type { ArticleQualityRating } from "@prisma/client";

import {
  articleQualityScalePrompt,
  articleQualityRatingValues,
} from "@/lib/article-quality";
import { openAiClient } from "@/lib/ai";
import { getConstitutionText } from "@/lib/constitution";
import { env } from "@/lib/env";
import { formatErrorSummary, getErrorDiagnostics, logEvent } from "@/lib/observability";

const qualityChecklistSchema = z.object({
  scopeFit: z.string().min(8).max(480),
  technicalDepth: z.string().min(8).max(480),
  novelty: z.string().min(8).max(480),
  evidenceQuality: z.string().min(8).max(480),
  reasoningQuality: z.string().min(8).max(480),
  practicalValue: z.string().min(8).max(480),
  clarity: z.string().min(8).max(480),
  penalties: z.string().min(8).max(480),
});

const summarySchema = z.object({
  bullets: z.array(z.string().min(8).max(480)).min(4).max(8),
  readSeconds: z.number().int().min(10).max(30),
  qualityRating: z.enum(articleQualityRatingValues),
  qualityChecklist: qualityChecklistSchema.optional(),
  qualityRationale: z.string().min(24).max(4000),
});

export type SummaryResult = {
  bullets: string[];
  readSeconds: number;
  qualityRating: ArticleQualityRating;
  qualityRationale: string;
  model: string;
};

export type SummaryGradingFailureReason = "openai-unavailable" | "openai-error" | "parse-failed";

type SummaryGradingErrorContext = {
  reason: SummaryGradingFailureReason;
  gradingModel: string;
  message: string;
  responseId?: string;
  parseError?: string;
  outputPreview?: string;
  diagnostics?: ReturnType<typeof getErrorDiagnostics>;
};

export class SummaryGradingError extends Error {
  readonly reason: SummaryGradingFailureReason;
  readonly gradingModel: string;
  readonly responseId: string | null;
  readonly parseError: string | null;
  readonly outputPreview: string | null;
  readonly diagnostics: ReturnType<typeof getErrorDiagnostics> | null;

  constructor(context: SummaryGradingErrorContext) {
    super(context.message);
    this.name = "SummaryGradingError";
    this.reason = context.reason;
    this.gradingModel = context.gradingModel;
    this.responseId = context.responseId ?? null;
    this.parseError = context.parseError ?? null;
    this.outputPreview = context.outputPreview ?? null;
    this.diagnostics = context.diagnostics ?? null;
  }
}

type ParseSummaryResult = {
  summary: SummaryResult | null;
  parseError?: string;
  jsonPayloadPreview?: string;
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
    `Clarity/accessibility: ${cleanSentence(checklist.clarity)}`,
  ];

  const normalizedPenalty = cleanSentence(checklist.penalties);
  if (!/^(none|n\/a|no material|no major)/i.test(normalizedPenalty)) {
    checklistSummary.push(`Penalties: ${normalizedPenalty}`);
  }

  return checklistSummary.join(" ");
};

const buildQualityRationale = ({
  qualityRationale,
  qualityChecklist,
}: {
  qualityRationale: string;
  qualityChecklist?: z.infer<typeof qualityChecklistSchema>;
}): string => {
  const normalizedRationale = cleanSentence(qualityRationale);

  if (!qualityChecklist) {
    return normalizedRationale;
  }

  const checklistSummary = summarizeChecklistForRationale(qualityChecklist);
  return `${normalizedRationale}\n\nChecklist signals: ${checklistSummary}`;
};

const logSummaryGradingFailure = (error: SummaryGradingError): void => {
  logEvent("error", "summary.grading.failed", {
    reason: error.reason,
    gradingModel: error.gradingModel,
    responseId: error.responseId,
    parseError: error.parseError,
    outputPreview: error.outputPreview,
    diagnostics: error.diagnostics,
  });
};

const parseSummaryJson = (rawText: string, model: string): ParseSummaryResult => {
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
      return {
        summary: null,
        parseError: "No JSON object found in model response.",
      };
    }

    const parsed = JSON.parse(jsonPayload);
    const validated = summarySchema.parse(parsed);
    const normalizedBullets = normalizeSummaryBullets(validated.bullets);

    if (normalizedBullets.length < 4) {
      return {
        summary: null,
        parseError: "Parsed summary had fewer than 4 usable bullets after normalization.",
        jsonPayloadPreview: trimToMax(jsonPayload, 420),
      };
    }

    return {
      summary: {
        bullets: normalizedBullets,
        readSeconds: validated.readSeconds,
        qualityRating: validated.qualityRating,
        qualityRationale: buildQualityRationale({
          qualityChecklist: validated.qualityChecklist,
          qualityRationale: validated.qualityRationale,
        }),
        model,
      },
    };
  } catch (error: unknown) {
    return {
      summary: null,
      parseError: formatErrorSummary(error, 260),
      jsonPayloadPreview: trimToMax(rawText, 420),
    };
  }
};

export const summarizeArticle = async (
  title: string,
  articleUrl: string,
  articleText: string,
): Promise<SummaryResult> => {
  const gradingModel = env.constitutionGraderModel;

  if (!openAiClient) {
    const gradingError = new SummaryGradingError({
      reason: "openai-unavailable",
      gradingModel,
      message: "OpenAI client is unavailable; constitutional quality scoring cannot run.",
    });
    logSummaryGradingFailure(gradingError);
    throw gradingError;
  }

  const constitution = await getConstitutionText();
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
    "Favor articles that make technically hard ideas understandable to engineers and scientists from adjacent domains.",
    "In qualityChecklist.clarity, explicitly judge outsider comprehensibility: jargon explained, context provided, and core contribution understandable without deep niche background.",
    "If outsider comprehensibility is weak and explanatory scaffolding is missing, apply a meaningful penalty and avoid top-tier ratings.",
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
    if (parsed.summary) {
      return parsed.summary;
    }

    const gradingError = new SummaryGradingError({
      reason: "parse-failed",
      gradingModel,
      message: "Model response could not be parsed into a constitutional quality score.",
      responseId: response.id,
      parseError: parsed.parseError,
      outputPreview: parsed.jsonPayloadPreview,
    });
    logSummaryGradingFailure(gradingError);
    throw gradingError;
  } catch (error: unknown) {
    if (error instanceof SummaryGradingError) {
      throw error;
    }

    const diagnostics = getErrorDiagnostics(error);
    const gradingError = new SummaryGradingError({
      reason: "openai-error",
      gradingModel,
      message: `OpenAI constitutional scoring request failed: ${diagnostics.message}`,
      diagnostics,
    });
    logEvent("error", "summary.openai.request_failed", {
      gradingModel,
      error: diagnostics,
    });
    logSummaryGradingFailure(gradingError);
    throw gradingError;
  }
};
