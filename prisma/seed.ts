import { PrismaClient } from "@prisma/client";

import { curatedFeedSeeds } from "../src/lib/curated-feeds";

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  for (const source of curatedFeedSeeds) {
    await prisma.feedSource.upsert({
      where: { url: source.url },
      update: {
        name: source.name,
        description: source.description,
        isActive: true,
      },
      create: {
        name: source.name,
        url: source.url,
        description: source.description,
      },
    });
  }
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
