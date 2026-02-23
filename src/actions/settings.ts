"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn } from "@/auth";
import { requireManifestoUser } from "@/lib/auth-guards";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const scheduleSchema = z.object({
  label: z.string().max(120).optional(),
  bookingPageUrl: z.string().url().max(2_048),
});

const scheduleIdSchema = z.object({
  scheduleId: z.string().min(1).max(120),
});

const userHasGoogleCalendarAccess = async (userId: string): Promise<boolean> => {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
      refresh_token: {
        not: null,
      },
      scope: {
        contains: "calendar",
      },
    },
    select: {
      providerAccountId: true,
    },
  });

  return Boolean(account);
};

const deriveScheduleLabel = (label: string | undefined, bookingPageUrl: string): string => {
  const trimmed = label?.trim();
  if (trimmed) {
    return trimmed;
  }

  try {
    const url = new URL(bookingPageUrl);
    if (url.hostname === "calendar.app.google") {
      return "Google Appointment Schedule";
    }

    return `Schedule (${url.hostname})`;
  } catch {
    return "Google Appointment Schedule";
  }
};

export const connectGoogleCalendarAction = async (): Promise<void> => {
  await requireManifestoUser();

  if (!env.hasGoogleOAuth) {
    redirect("/settings?error=google-oauth-disabled");
  }

  await signIn("google", {
    redirectTo: "/settings?google=connected",
  });
};

export const linkAppointmentScheduleAction = async (formData: FormData): Promise<void> => {
  const user = await requireManifestoUser();

  if (!(await userHasGoogleCalendarAccess(user.id))) {
    redirect("/settings?error=google-not-linked");
  }

  const parsed = scheduleSchema.safeParse({
    label: formData.get("label") || undefined,
    bookingPageUrl: formData.get("bookingPageUrl") || undefined,
  });

  if (!parsed.success || !parsed.data.bookingPageUrl.startsWith("https://")) {
    redirect("/settings?error=invalid-schedule");
  }

  const bookingPageUrl = parsed.data.bookingPageUrl.trim();
  const label = deriveScheduleLabel(parsed.data.label, bookingPageUrl);

  const existing = await prisma.appointmentSchedule.findUnique({
    where: {
      userId_bookingPageUrl: {
        userId: user.id,
        bookingPageUrl,
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    await prisma.appointmentSchedule.update({
      where: {
        id: existing.id,
      },
      data: {
        label,
      },
    });

    revalidatePath("/settings");
    redirect("/settings?schedule=updated");
  }

  const existingCount = await prisma.appointmentSchedule.count({
    where: {
      userId: user.id,
    },
  });

  await prisma.appointmentSchedule.create({
    data: {
      userId: user.id,
      label,
      bookingPageUrl,
      isActive: existingCount === 0,
    },
  });

  revalidatePath("/settings");
  redirect("/settings?schedule=linked");
};

export const activateAppointmentScheduleAction = async (formData: FormData): Promise<void> => {
  const user = await requireManifestoUser();

  const parsed = scheduleIdSchema.safeParse({
    scheduleId: formData.get("scheduleId"),
  });

  if (!parsed.success) {
    redirect("/settings?error=invalid-schedule");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const schedule = await tx.appointmentSchedule.findFirst({
        where: {
          id: parsed.data.scheduleId,
          userId: user.id,
        },
        select: {
          id: true,
        },
      });

      if (!schedule) {
        throw new Error("Schedule not found.");
      }

      await tx.appointmentSchedule.updateMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      await tx.appointmentSchedule.update({
        where: {
          id: schedule.id,
        },
        data: {
          isActive: true,
        },
      });
    });
  } catch {
    redirect("/settings?error=schedule-not-found");
  }

  revalidatePath("/settings");
  redirect("/settings?schedule=active");
};

export const unlinkAppointmentScheduleAction = async (formData: FormData): Promise<void> => {
  const user = await requireManifestoUser();

  const parsed = scheduleIdSchema.safeParse({
    scheduleId: formData.get("scheduleId"),
  });

  if (!parsed.success) {
    redirect("/settings?error=invalid-schedule");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const schedule = await tx.appointmentSchedule.findFirst({
        where: {
          id: parsed.data.scheduleId,
          userId: user.id,
        },
        select: {
          id: true,
          isActive: true,
        },
      });

      if (!schedule) {
        throw new Error("Schedule not found.");
      }

      await tx.appointmentSchedule.delete({
        where: {
          id: schedule.id,
        },
      });

      if (schedule.isActive) {
        const nextSchedule = await tx.appointmentSchedule.findFirst({
          where: {
            userId: user.id,
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
          },
        });

        if (nextSchedule) {
          await tx.appointmentSchedule.update({
            where: {
              id: nextSchedule.id,
            },
            data: {
              isActive: true,
            },
          });
        }
      }
    });
  } catch {
    redirect("/settings?error=schedule-not-found");
  }

  revalidatePath("/settings");
  redirect("/settings?schedule=removed");
};
