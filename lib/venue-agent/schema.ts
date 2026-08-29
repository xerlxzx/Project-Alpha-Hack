import { z } from "zod"

// PRD §9.8: structured plan Gemini returns to drive the Places search.
export const SearchPlanSchema = z.object({
  textQuery: z.string(),
  keywords: z.array(z.string()),
  radiusM: z.number(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  openNow: z.boolean().optional(),
})

export type SearchPlan = z.infer<typeof SearchPlanSchema>

// PRD §17: Agent contract JSON — field names and types must match exactly.
export const RecommendationSchema = z.object({
  activityTitle: z.string(),
  placeId: z.string(),
  venueName: z.string(),
  reason: z.string(),
  estimatedCostAud: z.number(),
  estimatedDistanceKm: z.number(),
  overBudgetPreference: z.boolean(),
  overDistancePreference: z.boolean(),
  bookingRequired: z.boolean(),
  bookingUrl: z.string().url().nullable(),
  confidence: z.number().min(0).max(1),
})

export type Recommendation = z.infer<typeof RecommendationSchema>
