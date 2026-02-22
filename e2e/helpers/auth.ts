import type { BrowserContext } from "@playwright/test";
import type { User } from "@prisma/client";

import { createSessionForUser, createUser } from "./db";

type LoginOptions = {
  baseUrl: string;
  name?: string;
  email?: string;
  manifestoAccepted?: boolean;
  interests?: string | null;
  goals?: string | null;
  ideasInFlight?: string | null;
  headline?: string | null;
};

export const loginAsUser = async (
  context: BrowserContext,
  options: LoginOptions,
): Promise<{ user: User; sessionToken: string }> => {
  const user = await createUser({
    name: options.name,
    email: options.email,
    manifestoAcceptedAt: options.manifestoAccepted ? new Date() : null,
    interests: options.interests,
    goals: options.goals,
    ideasInFlight: options.ideasInFlight,
    headline: options.headline,
  });

  const session = await createSessionForUser(user.id);

  await context.addCookies([
    {
      name: "authjs.session-token",
      value: session.sessionToken,
      url: options.baseUrl,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(session.expires.valueOf() / 1000),
    },
  ]);

  return {
    user,
    sessionToken: session.sessionToken,
  };
};
