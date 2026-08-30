import { z } from "zod"

// What Gemini extracts from the user's free-text concierge prompt.
//
// No start-time field: the concierge always means "I'm free right now"
// (same semantics as the page's existing "im_free" mode). A user who wants
// to schedule ahead already has the existing "Plan ahead" sheet for that.
export const ConciergeIntentSchema = z.object({
  moodSummary: z.string(),
  maxDurationMin: z.number().int().positive().max(240),
  // "Other people", not counting the caller. null means no preference.
  groupSizeHint: z.number().int().min(1).max(5).nullable(),
  proposedActivity: z.string().nullable(),
  socialEnergy: z.enum(["low", "medium", "high"]).nullable(),
})

export type ConciergeIntent = z.infer<typeof ConciergeIntentSchema>

// What the synthesis step produces once a deterministic match + venue pick
// already exist. Grounded only in facts already computed — see
// lib/concierge/synthesize.ts's prompt for the "never invent" instruction.
export const ConciergeSynthesisSchema = z.object({
  explanation: z.string(),
  opener: z.string(),
})

export type ConciergeSynthesis = z.infer<typeof ConciergeSynthesisSchema>
