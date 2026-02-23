import { randomUUID } from "node:crypto";

import {
  PrismaClient,
  type ArticleQualityRating,
  type PostSourceType,
  type SummaryStatus,
  type User,
} from "@prisma/client";

const prisma = new PrismaClient();

type CreateUserInput = {
  email?: string;
  name?: string;
  manifestoAcceptedAt?: Date | null;
  interests?: string | null;
  goals?: string | null;
  ideasInFlight?: string | null;
  headline?: string | null;
};

type SeedPostInput = {
  title: string;
  url: string;
  canonicalUrl: string;
  domain?: string;
  sourceType?: PostSourceType;
  summaryStatus?: SummaryStatus;
  summaryBullets?: string[];
  summaryReadSeconds?: number;
  qualityRating?: ArticleQualityRating | null;
  qualityRationale?: string | null;
  excerpt?: string | null;
  feedSourceId?: string | null;
  submittedById?: string | null;
  publishedAt?: Date | null;
  createdAt?: Date;
};

export const resetDatabase = async (): Promise<void> => {
  await prisma.postComment.deleteMany();
  await prisma.profileSignal.deleteMany();
  await prisma.post.deleteMany();
  await prisma.feedSource.deleteMany();
  await prisma.jobRun.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();
};

export const createUser = async (input: CreateUserInput = {}): Promise<User> => {
  return prisma.user.create({
    data: {
      email: input.email ?? `${randomUUID()}@example.test`,
      name: input.name ?? "E2E User",
      manifestoAcceptedAt: input.manifestoAcceptedAt ?? null,
      interests: input.interests ?? null,
      goals: input.goals ?? null,
      ideasInFlight: input.ideasInFlight ?? null,
      headline: input.headline ?? null,
    },
  });
};

export const createSessionForUser = async (userId: string): Promise<{ sessionToken: string; expires: Date }> => {
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      sessionToken,
      userId,
      expires,
    },
  });

  return {
    sessionToken,
    expires,
  };
};

export const createFeedSource = async (url: string, name = "E2E Feed Source") => {
  return prisma.feedSource.create({
    data: {
      url,
      name,
      sourceType: "CURATED",
      isActive: true,
    },
  });
};

export const seedPost = async (input: SeedPostInput) => {
  return prisma.post.create({
    data: {
      title: input.title,
      url: input.url,
      canonicalUrl: input.canonicalUrl,
      domain: input.domain ?? new URL(input.url).hostname,
      sourceType: input.sourceType ?? "CURATED_RSS",
      summaryStatus: input.summaryStatus ?? "COMPLETE",
      summaryBullets: input.summaryBullets ?? [],
      summaryReadSeconds: input.summaryReadSeconds ?? 20,
      qualityRating: input.qualityRating ?? null,
      qualityRationale: input.qualityRationale ?? null,
      excerpt: input.excerpt ?? null,
      feedSourceId: input.feedSourceId ?? null,
      submittedById: input.submittedById ?? null,
      publishedAt: input.publishedAt ?? input.createdAt ?? new Date(),
      createdAt: input.createdAt,
    },
  });
};

export const prismaClient = prisma;

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};
