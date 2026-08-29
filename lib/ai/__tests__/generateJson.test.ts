import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const generateContentMock = vi.fn()

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class GoogleGenAI {
      models = { generateContent: generateContentMock }
    },
  }
})

import { generateJson, AiJsonError } from "@/lib/ai/generateJson"

describe("generateJson", () => {
  beforeEach(() => {
    generateContentMock.mockReset()
    vi.stubEnv("GEMINI_API_KEY", "test-key")
  })

  it("parses Gemini's JSON text response", async () => {
    generateContentMock.mockResolvedValue({ text: '{"foo":"bar"}' })
    const result = await generateJson("a prompt", z.object({ foo: z.string() }))
    expect(result).toEqual({ foo: "bar" })
  })

  it("throws AiJsonError when Gemini returns no text", async () => {
    generateContentMock.mockResolvedValue({ text: undefined })
    await expect(generateJson("a prompt", z.object({}))).rejects.toBeInstanceOf(AiJsonError)
  })
})
