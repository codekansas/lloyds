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

const resolveConstitutionGraderModel = (): string => {
  const explicitModel = process.env.OPENAI_CONSTITUTION_GRADER_MODEL?.trim();
  if (explicitModel) {
    return explicitModel;
  }

  return "gpt-4.1";
};

const resolveAppBaseUrl = (): string | undefined => {
  const explicitAppBaseUrl = process.env.APP_BASE_URL?.trim();
  if (explicitAppBaseUrl) {
    return explicitAppBaseUrl.replace(/\/+$/, "");
  }

  const authBaseUrl = process.env.NEXTAUTH_URL?.trim() || process.env.AUTH_URL?.trim();
  if (authBaseUrl) {
    return authBaseUrl.replace(/\/+$/, "");
  }

  return undefined;
};

const env = {
  appEnv: resolveAppEnvironment(),
  appBaseUrl: resolveAppBaseUrl(),
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
  constitutionGraderModel: resolveConstitutionGraderModel(),
  notificationEmailFrom: process.env.NOTIFICATION_EMAIL_FROM,
  resendApiKey: process.env.RESEND_API_KEY,
} as const;

export const getRequiredEnv = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export { env };
