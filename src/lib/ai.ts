import OpenAI from "openai";

import { env } from "@/lib/env";

export const openAiClient = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;
