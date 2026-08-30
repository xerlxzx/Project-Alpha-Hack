import { GoogleGenAI } from "@google/genai"
import { z } from "zod"
import { GEMINI_MODEL } from "@/lib/config"

export class AiJsonError extends Error {}

// Calls Gemini with the given prompt, steering its output shape via
// `responseSchema`, and returns the parsed JSON. Does not validate the
// result against `schema` — callers own that with `schema.parse(raw)`, the
// same two-step shape lib/venue-agent/agent.ts already uses.
//
// Takes an already-constructed client rather than building one itself, so
// callers construct it eagerly at their own buildDefaultDeps() call site —
// surfacing a missing GEMINI_API_KEY immediately, before any retry loop can
// swallow it — and so multiple calls in one run can share one client.
export async function generateJson(client: GoogleGenAI, prompt: string, schema: z.ZodType): Promise<unknown> {
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: z.toJSONSchema(schema),
    },
  })
  const text = response.text
  if (!text) {
    throw new AiJsonError("Gemini returned no structured output")
  }
  return JSON.parse(text)
}
