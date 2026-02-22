import { google } from "googleapis";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const buildOAuthClient = () => {
  const clientId = env.googleClientId;
  const clientSecret = env.googleClientSecret;

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret);
};

const getCalendarAccount = async (userId: string) => {
  return prisma.account.findFirst({
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
  });
};

export const isCalendarSlotFree = async (
  userId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<boolean> => {
  const account = await getCalendarAccount(userId);
  if (!account?.refresh_token) {
    return true;
  }

  const oauthClient = buildOAuthClient();
  if (!oauthClient) {
    return true;
  }

  oauthClient.setCredentials({
    refresh_token: account.refresh_token,
  });

  const calendar = google.calendar({
    version: "v3",
    auth: oauthClient,
  });

  try {
    const freebusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startsAt.toISOString(),
        timeMax: endsAt.toISOString(),
        items: [{ id: "primary" }],
      },
    });

    const busy = freebusy.data.calendars?.primary?.busy ?? [];
    return busy.length === 0;
  } catch {
    return true;
  }
};

export const createCalendarEvent = async (input: {
  userId: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  attendees: string[];
  location: string | null;
}): Promise<string | null> => {
  const account = await getCalendarAccount(input.userId);
  if (!account?.refresh_token) {
    return null;
  }

  const oauthClient = buildOAuthClient();
  if (!oauthClient) {
    return null;
  }

  oauthClient.setCredentials({
    refresh_token: account.refresh_token,
  });

  const calendar = google.calendar({
    version: "v3",
    auth: oauthClient,
  });

  try {
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: input.title,
        description: input.description,
        location: input.location ?? undefined,
        start: {
          dateTime: input.startsAt.toISOString(),
        },
        end: {
          dateTime: input.endsAt.toISOString(),
        },
        attendees: input.attendees.map((email) => ({ email })),
      },
    });

    return event.data.id ?? null;
  } catch {
    return null;
  }
};
