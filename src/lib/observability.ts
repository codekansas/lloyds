import { Prisma } from "@prisma/client";

import { env } from "@/lib/env";

type LogLevel = "info" | "warn" | "error";

export type ErrorDiagnostics = {
  kind: "prisma-known" | "prisma-initialization" | "prisma-validation" | "error" | "unknown";
  name: string;
  message: string;
  code?: string;
  meta?: string;
};

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
};

const serializeForLogs = (value: unknown): string => {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (_key, candidate) => {
    if (typeof candidate === "bigint") {
      return candidate.toString();
    }

    if (candidate instanceof Error) {
      return {
        name: candidate.name,
        message: candidate.message,
        stack: candidate.stack,
      };
    }

    if (typeof candidate === "object" && candidate !== null) {
      if (seen.has(candidate)) {
        return "[Circular]";
      }

      seen.add(candidate);
    }

    return candidate;
  });
};

export const getErrorDiagnostics = (error: unknown): ErrorDiagnostics => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      kind: "prisma-known",
      name: error.name,
      message: normalizeWhitespace(error.message),
      code: error.code,
      meta: error.meta ? truncate(serializeForLogs(error.meta), 220) : undefined,
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      kind: "prisma-initialization",
      name: error.name,
      message: normalizeWhitespace(error.message),
    };
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      kind: "prisma-validation",
      name: error.name,
      message: normalizeWhitespace(error.message),
    };
  }

  if (error instanceof Error) {
    return {
      kind: "error",
      name: error.name,
      message: normalizeWhitespace(error.message),
    };
  }

  return {
    kind: "unknown",
    name: "UnknownError",
    message: typeof error === "string" ? normalizeWhitespace(error) : "Unknown error",
  };
};

export const formatErrorSummary = (error: unknown, maxLength = 320): string => {
  const diagnostics = getErrorDiagnostics(error);
  const parts = [diagnostics.code ? `${diagnostics.name} (${diagnostics.code})` : diagnostics.name, diagnostics.message];

  if (diagnostics.meta) {
    parts.push(`meta=${diagnostics.meta}`);
  }

  return truncate(parts.join(" | "), maxLength);
};

export const logEvent = (level: LogLevel, event: string, context: Record<string, unknown> = {}): void => {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    appEnv: env.appEnv,
    ...context,
  };

  try {
    const serialized = serializeForLogs(payload);

    if (level === "error") {
      console.error(serialized);
      return;
    }

    if (level === "warn") {
      console.warn(serialized);
      return;
    }

    console.info(serialized);
  } catch {
    const fallback = `[${payload.timestamp}] [${level}] ${event}`;

    if (level === "error") {
      console.error(fallback);
      return;
    }

    if (level === "warn") {
      console.warn(fallback);
      return;
    }

    console.info(fallback);
  }
};
