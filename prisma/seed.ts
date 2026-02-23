import { prisma } from "../src/lib/prisma";
import { ensureCuratedFeedSources } from "../src/lib/seed-curated";

const main = async (): Promise<void> => {
  const result = await ensureCuratedFeedSources();

  console.log(
    JSON.stringify({
      message: "Curated feed source sync complete.",
      ...result,
    }),
  );
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
