import type { z } from "zod"
import { generateJson } from "@/lib/ai/generateJson"
import { ConciergeSynthesisSchema, type ConciergeSynthesis } from "@/lib/concierge/schema"

export interface SynthesisFacts {
  groupSize: number
  sharedInterestReasons: string[]
  venueName: string
  distanceKm: number
  maxDurationMin: number
  activityTitle: string
}

export interface SynthesisDeps {
  generate: (prompt: string, schema: z.ZodType) => Promise<unknown>
}

function buildSynthesisPrompt(facts: SynthesisFacts): string {
  return [
    "Write a short explanation and an opening group-chat message for a student meetup recommendation.",
    "Use ONLY the facts below. Do not invent names, places, or details not listed here.",
    `Facts: ${JSON.stringify(facts)}`,
    "explanation: 1-2 sentences, plain and warm, referencing the shared-interest reasons, group size, venue, and duration.",
    'Never name individual people — refer to them only by count (e.g. "two people nearby").',
    "opener: a short, friendly first message for the group chat that fits the activity.",
    "Return ONLY JSON matching the given schema.",
  ].join("\n")
}

function templateFallback(facts: SynthesisFacts): ConciergeSynthesis {
  const others = Math.max(facts.groupSize - 1, 0)
  const reason = facts.sharedInterestReasons[0]?.toLowerCase() ?? "similar plans"
  return {
    explanation: `${others} ${others === 1 ? "person" : "people"} nearby who match on ${reason} — ${facts.activityTitle} at ${facts.venueName}, about ${facts.distanceKm.toFixed(1)} km away, within your ${facts.maxDurationMin}-minute window.`,
    opener: `Hey! Keen to make the most of the next ${facts.maxDurationMin} minutes — see you at ${facts.venueName}?`,
  }
}

function buildDefaultDeps(): SynthesisDeps {
  return { generate: generateJson }
}

export async function synthesizeExplanation(
  facts: SynthesisFacts,
  deps: SynthesisDeps = buildDefaultDeps()
): Promise<ConciergeSynthesis> {
  try {
    const raw = await deps.generate(buildSynthesisPrompt(facts), ConciergeSynthesisSchema)
    return ConciergeSynthesisSchema.parse(raw)
  } catch {
    return templateFallback(facts)
  }
}
