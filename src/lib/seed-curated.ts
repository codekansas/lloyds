import { prisma } from "@/lib/prisma";
import { curatedFeedSeeds } from "@/lib/curated-feeds";

export const ensureCuratedFeedSources = async (): Promise<void> => {
  for (const source of curatedFeedSeeds) {
    await prisma.feedSource.upsert({
      where: {
        url: source.url,
      },
      update: {
        name: source.name,
        description: source.description,
        isActive: true,
      },
      create: {
        name: source.name,
        url: source.url,
        description: source.description,
        sourceType: "CURATED",
      },
    });
  }
};
