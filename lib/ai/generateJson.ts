import { GoogleGenAI } from "@google/genai"
import { z } from "zod"
import { GEMINI_MODEL, getEnv } from "@/lib/config"

export class AiJsonError extends Error {}

// Calls Gemini with the given prompt, steering its output shape via
// `responseSchema`, and returns the parsed JSON. Does not validate the
// result against `schema` — callers own that with `schema.parse(raw)`, the
// same two-step shape lib/venue-agent/agent.ts already uses.
export async function generateJson(prompt: string, schema: z.ZodType): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") })
  const response = await ai.models.generateContent({
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
