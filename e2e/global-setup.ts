import { execSync } from "node:child_process";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env variable for e2e tests: ${name}`);
  }

  return value;
};

const globalSetup = async (): Promise<void> => {
  requireEnv("DATABASE_URL");

  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: process.env,
  });
};

export default globalSetup;
