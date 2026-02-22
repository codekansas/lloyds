"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireManifestoUser } from "@/lib/auth-guards";
import { runMatchingBatch } from "@/lib/matching";
import { prisma } from "@/lib/prisma";

const availabilitySchema = z.object({
  startsAt: z.string().min(5),
  endsAt: z.string().min(5),
  timezone: z.string().max(80),
  mode: z.enum(["VIRTUAL", "IN_PERSON", "EITHER"]),
  location: z.string().max(180).optional(),
  notes: z.string().max(1_000).optional(),
});

const parseDate = (value: string): Date | null => {
  const candidate = new Date(value);
  return Number.isNaN(candidate.valueOf()) ? null : candidate;
};

export const addAvailabilityAction = async (formData: FormData): Promise<void> => {
  const user = await requireManifestoUser();

  const parsed = availabilitySchema.safeParse({
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    timezone: formData.get("timezone") || "UTC",
    mode: formData.get("mode"),
    location: formData.get("location") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect("/matching?error=invalid-input");
  }

  const startsAt = parseDate(parsed.data.startsAt);
  const endsAt = parseDate(parsed.data.endsAt);

  if (!startsAt || !endsAt || endsAt <= startsAt) {
    redirect("/matching?error=invalid-window");
  }

  await prisma.availability.create({
    data: {
      userId: user.id,
      startsAt,
      endsAt,
      timezone: parsed.data.timezone,
      mode: parsed.data.mode,
      location: parsed.data.location?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
    },
  });

  revalidatePath("/matching");
  redirect("/matching?availability=added");
};

export const runMatchingNowAction = async (): Promise<void> => {
  await requireManifestoUser();
  const result = await runMatchingBatch(8);
  revalidatePath("/matching");
  redirect(`/matching?matched=${result.matchesCreated}`);
};
