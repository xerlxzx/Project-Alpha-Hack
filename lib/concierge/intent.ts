import type { z } from "zod"
import { GoogleGenAI } from "@google/genai"
import { getEnv } from "@/lib/config"
import { generateJson } from "@/lib/ai/generateJson"
import { ConciergeIntentSchema, type ConciergeIntent } from "@/lib/concierge/schema"

export class ConciergeIntentError extends Error {}

export interface IntentDeps {
  generate: (prompt: string, schema: z.ZodType) => Promise<unknown>
}

function buildIntentPrompt(text: string): string {
  return [
    "A student typed this into a spontaneous-meetup app's free-text concierge box.",
    "Extract structured intent. Return ONLY JSON matching the given schema.",
    `Message: ${JSON.stringify(text)}`,
    "maxDurationMin: how long they want to spend, in minutes. If not stated, use 90.",
    "groupSizeHint: how many OTHER people they want to meet, not counting themselves, 1-5. null if not stated.",
    'proposedActivity: a short activity keyword (e.g. "study", "coffee", "badminton") if implied, else null.',
    'socialEnergy: "low", "medium", or "high" based on their stated mood/energy, else null.',
    "moodSummary: a short (under 12 words) paraphrase of their mood and constraints.",
  ].join("\n")
}

function buildDefaultDeps(): IntentDeps {
  const client = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") })
  return { generate: (prompt, schema) => generateJson(client, prompt, schema) }
}

export async function interpretIntent(text: string, deps: IntentDeps = buildDefaultDeps()): Promise<ConciergeIntent> {
  const prompt = buildIntentPrompt(text)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await deps.generate(prompt, ConciergeIntentSchema)
      return ConciergeIntentSchema.parse(raw)
    } catch {
      // First failure: retry once. Second failure (or a validation failure
      // on the second attempt): fall through to the throw below.
    }
  }

  throw new ConciergeIntentError("Couldn't understand that — try rephrasing.")
}
