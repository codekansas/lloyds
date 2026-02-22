"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireManifestoUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { getDomainFromUrl, normalizeUrl } from "@/lib/url";

const postSchema = z.object({
  title: z.string().min(6).max(180),
  url: z.string().url().max(2_000),
  excerpt: z.string().max(800).optional(),
});

export const submitPostAction = async (formData: FormData): Promise<void> => {
  const user = await requireManifestoUser();

  const parsed = postSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
    excerpt: formData.get("excerpt") || undefined,
  });

  if (!parsed.success) {
    redirect("/submit?error=invalid-input");
  }

  let canonicalUrl: string;
  let domain: string;

  try {
    canonicalUrl = normalizeUrl(parsed.data.url);
    domain = getDomainFromUrl(canonicalUrl);
  } catch {
    redirect("/submit?error=invalid-url");
  }

  const existing = await prisma.post.findUnique({
    where: {
      canonicalUrl,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    redirect("/submit?error=already-exists");
  }

  await prisma.post.create({
    data: {
      title: parsed.data.title.trim(),
      url: parsed.data.url.trim(),
      canonicalUrl,
      domain,
      excerpt: parsed.data.excerpt?.trim() || null,
      sourceType: "USER_SUBMISSION",
      submittedById: user.id,
      summaryStatus: "PENDING",
    },
  });

  revalidatePath("/feed");
  redirect("/feed?submitted=1");
};
