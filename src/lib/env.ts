const resolveAppEnvironment = (): "development" | "staging" | "production" => {
  const explicitAppEnv = process.env.APP_ENV?.trim().toLowerCase();
  if (explicitAppEnv === "development" || explicitAppEnv === "staging" || explicitAppEnv === "production") {
    return explicitAppEnv;
  }

  if (process.env.NODE_ENV === "production") {
    return "production";
  }

  return "development";
};

const resolveOpenAiApiKey = (): string | undefined => {
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  const appEnv = resolveAppEnvironment();
  if (appEnv === "production") {
    return process.env.OPENAI_API_KEY_PRODUCTION;
  }

  if (appEnv === "staging") {
    return process.env.OPENAI_API_KEY_STAGING;
  }

  return process.env.OPENAI_API_KEY_DEVELOPMENT;
};

const env = {
  appEnv: resolveAppEnvironment(),
  authSecret: process.env.AUTH_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  hasGoogleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  hasGithubOAuth: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  cronSecret: process.env.CRON_SECRET,
  openAiApiKey: resolveOpenAiApiKey(),
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
} as const;

export const getRequiredEnv = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export { env };
