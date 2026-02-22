import { type Availability, type AvailabilityMode, type MatchMode, type User } from "@prisma/client";

import { openAiClient } from "@/lib/ai";
import { createCalendarEvent, isCalendarSlotFree } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";

type AvailabilityWithUser = Availability & {
  user: Pick<User, "id" | "name" | "email" | "headline" | "bio" | "interests" | "goals" | "ideasInFlight">;
};

type PairCandidate = {
  availabilityA: AvailabilityWithUser;
  availabilityB: AvailabilityWithUser;
  slotStartsAt: Date;
  slotEndsAt: Date;
  mode: MatchMode;
  location: string | null;
  heuristicScore: number;
};

export type MatchJobResult = {
  candidatesEvaluated: number;
  matchesCreated: number;
  skippedBusyCalendar: number;
  errors: string[];
};

const MINIMUM_OVERLAP_MINUTES = 35;

const minutesBetween = (start: Date, end: Date): number => {
  return Math.max(0, Math.floor((end.valueOf() - start.valueOf()) / 60_000));
};

const computeOverlap = (
  left: AvailabilityWithUser,
  right: AvailabilityWithUser,
): { start: Date; end: Date; minutes: number } => {
  const start = new Date(Math.max(left.startsAt.valueOf(), right.startsAt.valueOf()));
  const end = new Date(Math.min(left.endsAt.valueOf(), right.endsAt.valueOf()));
  return {
    start,
    end,
    minutes: minutesBetween(start, end),
  };
};

const deriveMode = (left: AvailabilityMode, right: AvailabilityMode): MatchMode | null => {
  if (left === "VIRTUAL" && right === "VIRTUAL") {
    return "VIRTUAL";
  }

  if (left === "IN_PERSON" && right === "IN_PERSON") {
    return "IN_PERSON";
  }

  if (left === "EITHER" && right === "EITHER") {
    return "VIRTUAL";
  }

  if ((left === "EITHER" && right === "VIRTUAL") || (left === "VIRTUAL" && right === "EITHER")) {
    return "VIRTUAL";
  }

  if ((left === "EITHER" && right === "IN_PERSON") || (left === "IN_PERSON" && right === "EITHER")) {
    return "IN_PERSON";
  }

  return null;
};

const normalizeTokens = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
};

const userTokenSet = (user: AvailabilityWithUser["user"]): Set<string> => {
  return new Set(
    normalizeTokens(
      [user.headline, user.bio, user.interests, user.goals, user.ideasInFlight].filter(Boolean).join(" "),
    ),
  );
};

const keywordOverlapScore = (
  left: AvailabilityWithUser["user"],
  right: AvailabilityWithUser["user"],
): number => {
  const leftTokens = userTokenSet(left);
  const rightTokens = userTokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0.25;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  const denominator = Math.sqrt(leftTokens.size * rightTokens.size);
  return Math.min(1, overlap / Math.max(1, denominator));
};

const locationAffinity = (left: string | null, right: string | null, mode: MatchMode): number => {
  if (mode === "VIRTUAL") {
    return 0.1;
  }

  if (!left || !right) {
    return 0;
  }

  return left.toLowerCase().includes(right.toLowerCase()) || right.toLowerCase().includes(left.toLowerCase())
    ? 0.25
    : 0.05;
};

const heuristicPairScore = (
  availabilityA: AvailabilityWithUser,
  availabilityB: AvailabilityWithUser,
  overlapMinutes: number,
  mode: MatchMode,
): number => {
  const overlapScore = Math.min(1, overlapMinutes / 120);
  const keywordScore = keywordOverlapScore(availabilityA.user, availabilityB.user);
  const locationScore = locationAffinity(availabilityA.location, availabilityB.location, mode);

  return overlapScore * 0.35 + keywordScore * 0.55 + locationScore * 0.1;
};

const buildFallbackRationale = (
  candidate: PairCandidate,
  score: number,
): string => {
  const focusA = candidate.availabilityA.user.interests || candidate.availabilityA.user.goals || "shared goals";
  const focusB = candidate.availabilityB.user.interests || candidate.availabilityB.user.goals || "practical execution";

  return `Both members show compatible interests (${focusA.slice(0, 90)} / ${focusB.slice(0, 90)}) and overlapping time windows. Heuristic compatibility score: ${score.toFixed(2)}.`;
};

const buildAiRationale = async (candidate: PairCandidate): Promise<{ score: number; rationale: string } | null> => {
  if (!openAiClient) {
    return null;
  }

  const prompt = [
    "Evaluate whether two thoughtful community members should be matched for a high-signal conversation.",
    "Return strict JSON with keys: score (0 to 1 float), rationale (max 60 words).",
    "Focus on complementary thinking styles, shared interests, and practical conversation value.",
    "---",
    `User A interests: ${candidate.availabilityA.user.interests ?? ""}`,
    `User A goals: ${candidate.availabilityA.user.goals ?? ""}`,
    `User A ideas: ${candidate.availabilityA.user.ideasInFlight ?? ""}`,
    `User B interests: ${candidate.availabilityB.user.interests ?? ""}`,
    `User B goals: ${candidate.availabilityB.user.goals ?? ""}`,
    `User B ideas: ${candidate.availabilityB.user.ideasInFlight ?? ""}`,
    `Overlap minutes: ${minutesBetween(candidate.slotStartsAt, candidate.slotEndsAt)}`,
    `Mode: ${candidate.mode}`,
  ].join("\n");

  try {
    const response = await openAiClient.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: prompt,
      temperature: 0.2,
      max_output_tokens: 220,
    });

    const parsed = JSON.parse(response.output_text) as { score?: number; rationale?: string };
    if (typeof parsed.score !== "number" || typeof parsed.rationale !== "string") {
      return null;
    }

    return {
      score: Math.max(0, Math.min(1, parsed.score)),
      rationale: parsed.rationale,
    };
  } catch {
    return null;
  }
};

const pickCandidates = (availabilities: AvailabilityWithUser[]): PairCandidate[] => {
  const candidates: PairCandidate[] = [];

  for (let leftIdx = 0; leftIdx < availabilities.length; leftIdx += 1) {
    const availabilityA = availabilities[leftIdx];
    for (let rightIdx = leftIdx + 1; rightIdx < availabilities.length; rightIdx += 1) {
      const availabilityB = availabilities[rightIdx];
      if (availabilityA.userId === availabilityB.userId) {
        continue;
      }

      const overlap = computeOverlap(availabilityA, availabilityB);
      if (overlap.minutes < MINIMUM_OVERLAP_MINUTES) {
        continue;
      }

      const mode = deriveMode(availabilityA.mode, availabilityB.mode);
      if (!mode) {
        continue;
      }

      const location = mode === "IN_PERSON" ? availabilityA.location ?? availabilityB.location ?? null : null;
      const heuristicScore = heuristicPairScore(availabilityA, availabilityB, overlap.minutes, mode);

      candidates.push({
        availabilityA,
        availabilityB,
        slotStartsAt: overlap.start,
        slotEndsAt: overlap.end,
        mode,
        location,
        heuristicScore,
      });
    }
  }

  return candidates.sort((left, right) => right.heuristicScore - left.heuristicScore);
};

const scheduleCalendarEventsForMatch = async (
  matchId: string,
  candidate: PairCandidate,
  rationale: string,
): Promise<{ eventA: string | null; eventB: string | null }> => {
  const attendeeA = candidate.availabilityA.user.email;
  const attendeeB = candidate.availabilityB.user.email;
  const attendeesForA = attendeeB ? [attendeeB] : [];
  const attendeesForB = attendeeA ? [attendeeA] : [];

  const title = "Lloyd's Coffee House Match";
  const description = `${rationale}\n\nMode: ${candidate.mode}`;

  const [eventA, eventB] = await Promise.all([
    createCalendarEvent({
      userId: candidate.availabilityA.user.id,
      title,
      description,
      startsAt: candidate.slotStartsAt,
      endsAt: candidate.slotEndsAt,
      attendees: attendeesForA,
      location: candidate.location,
    }),
    createCalendarEvent({
      userId: candidate.availabilityB.user.id,
      title,
      description,
      startsAt: candidate.slotStartsAt,
      endsAt: candidate.slotEndsAt,
      attendees: attendeesForB,
      location: candidate.location,
    }),
  ]);

  await prisma.match.update({
    where: {
      id: matchId,
    },
    data: {
      calendarEventAId: eventA,
      calendarEventBId: eventB,
      status: eventA || eventB ? "SCHEDULED" : "PROPOSED",
    },
  });

  return {
    eventA,
    eventB,
  };
};

export const runMatchingBatch = async (maxMatches = 12): Promise<MatchJobResult> => {
  const availabilities = await prisma.availability.findMany({
    where: {
      isMatched: false,
      startsAt: {
        gte: new Date(),
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          headline: true,
          bio: true,
          interests: true,
          goals: true,
          ideasInFlight: true,
        },
      },
    },
    orderBy: [{ startsAt: "asc" }],
    take: 100,
  });

  const candidates = pickCandidates(availabilities);
  const usedAvailabilities = new Set<string>();

  const result: MatchJobResult = {
    candidatesEvaluated: candidates.length,
    matchesCreated: 0,
    skippedBusyCalendar: 0,
    errors: [],
  };

  for (const candidate of candidates) {
    if (result.matchesCreated >= maxMatches) {
      break;
    }

    if (usedAvailabilities.has(candidate.availabilityA.id) || usedAvailabilities.has(candidate.availabilityB.id)) {
      continue;
    }

    try {
      const [userAFree, userBFree] = await Promise.all([
        isCalendarSlotFree(candidate.availabilityA.user.id, candidate.slotStartsAt, candidate.slotEndsAt),
        isCalendarSlotFree(candidate.availabilityB.user.id, candidate.slotStartsAt, candidate.slotEndsAt),
      ]);

      if (!userAFree || !userBFree) {
        result.skippedBusyCalendar += 1;
        continue;
      }

      const aiRationale = await buildAiRationale(candidate);
      const compatibilityScore = aiRationale?.score ?? candidate.heuristicScore;
      const rationale = aiRationale?.rationale ?? buildFallbackRationale(candidate, compatibilityScore);

      const createdMatch = await prisma.$transaction(async (tx) => {
        await tx.availability.update({
          where: {
            id: candidate.availabilityA.id,
          },
          data: {
            isMatched: true,
          },
        });

        await tx.availability.update({
          where: {
            id: candidate.availabilityB.id,
          },
          data: {
            isMatched: true,
          },
        });

        return tx.match.create({
          data: {
            userAId: candidate.availabilityA.user.id,
            userBId: candidate.availabilityB.user.id,
            availabilityAId: candidate.availabilityA.id,
            availabilityBId: candidate.availabilityB.id,
            slotStartsAt: candidate.slotStartsAt,
            slotEndsAt: candidate.slotEndsAt,
            mode: candidate.mode,
            location: candidate.location,
            aiRationale: rationale,
            compatibilityScore,
          },
        });
      });

      usedAvailabilities.add(candidate.availabilityA.id);
      usedAvailabilities.add(candidate.availabilityB.id);
      result.matchesCreated += 1;

      await scheduleCalendarEventsForMatch(createdMatch.id, candidate, rationale);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown matching error";
      result.errors.push(message);
    }
  }

  return result;
};
