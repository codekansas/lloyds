import { prisma } from "@/lib/prisma";

export const syncUserBlogFeedSource = async (userId: string, feedUrl: string | null): Promise<void> => {
  const existing = await prisma.feedSource.findFirst({
    where: {
      ownerUserId: userId,
      sourceType: "USER_BLOG",
    },
    select: {
      id: true,
      url: true,
    },
  });

  if (!feedUrl) {
    if (existing) {
      await prisma.feedSource.update({
        where: {
          id: existing.id,
        },
        data: {
          isActive: false,
        },
      });
    }

    return;
  }

  if (existing) {
    await prisma.feedSource.update({
      where: {
        id: existing.id,
      },
      data: {
        url: feedUrl,
        isActive: true,
      },
    });
    return;
  }

  await prisma.feedSource.create({
    data: {
      name: "User Blog Feed",
      url: feedUrl,
      sourceType: "USER_BLOG",
      ownerUserId: userId,
      isActive: true,
    },
  });
};
