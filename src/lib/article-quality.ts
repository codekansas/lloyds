import type { ArticleQualityRating } from "@prisma/client";

export const articleQualityRatingValues = [
  "COMMON_RUMOUR",
  "MERCHANTS_WORD",
  "CAPTAINS_ACCOUNT",
  "UNDERWRITERS_CONFIDENCE",
  "LLOYDS_ASSURANCE",
] as const satisfies readonly ArticleQualityRating[];

export const articleQualityRatingLabels: Record<ArticleQualityRating, string> = {
  COMMON_RUMOUR: "Common Rumour",
  MERCHANTS_WORD: "Merchant's Word",
  CAPTAINS_ACCOUNT: "Captain's Account",
  UNDERWRITERS_CONFIDENCE: "Underwriter's Confidence",
  LLOYDS_ASSURANCE: "The Lloyd's Assurance",
};

export const articleQualityRatingTargetShare: Record<ArticleQualityRating, number> = {
  COMMON_RUMOUR: 0.2,
  MERCHANTS_WORD: 0.3,
  CAPTAINS_ACCOUNT: 0.3,
  UNDERWRITERS_CONFIDENCE: 0.15,
  LLOYDS_ASSURANCE: 0.05,
};

export const articleQualityRankingWeight: Record<ArticleQualityRating, number> = {
  COMMON_RUMOUR: 1,
  MERCHANTS_WORD: 2,
  CAPTAINS_ACCOUNT: 3,
  UNDERWRITERS_CONFIDENCE: 4,
  LLOYDS_ASSURANCE: 5,
};

export const articleQualityScalePrompt = articleQualityRatingValues
  .map((rating) => {
    const percentage = Math.round(articleQualityRatingTargetShare[rating] * 100);
    return `- ${articleQualityRatingLabels[rating]} (${rating}) target share ${percentage}%`;
  })
  .join("\n");

export const qualityWeightFromRating = (rating: ArticleQualityRating | null | undefined): number => {
  if (!rating) {
    return 0;
  }

  return articleQualityRankingWeight[rating];
};

export const qualityLabelFromRating = (rating: ArticleQualityRating | null | undefined): string => {
  if (!rating) {
    return "Unrated";
  }

  return articleQualityRatingLabels[rating];
};
