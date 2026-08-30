import { describe, expect, it, vi } from "vitest"
import type { GoogleGenAI } from "@google/genai"
import { z } from "zod"
import { generateJson, AiJsonError } from "@/lib/ai/generateJson"

function makeClient(text: string | undefined): GoogleGenAI {
  return { models: { generateContent: vi.fn().mockResolvedValue({ text }) } } as unknown as GoogleGenAI
}

describe("generateJson", () => {
  it("parses Gemini's JSON text response", async () => {
    const client = makeClient('{"foo":"bar"}')
    const result = await generateJson(client, "a prompt", z.object({ foo: z.string() }))
    expect(result).toEqual({ foo: "bar" })
  })

  it("throws AiJsonError when Gemini returns no text", async () => {
    const client = makeClient(undefined)
    await expect(generateJson(client, "a prompt", z.object({}))).rejects.toBeInstanceOf(AiJsonError)
  })
})
