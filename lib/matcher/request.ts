import { z } from "zod"

const AvailabilityOverrideSchema = z
  .object({
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    mode: z.enum(["im_free", "plan_ahead"]).optional(),
  })
  .refine((window) => Date.parse(window.endAt) > Date.parse(window.startAt), {
    message: "endAt must be later than startAt",
    path: ["endAt"],
  })

export const MatchRequestSchema = z
  .object({
    travelKm: z.number().min(1).max(100).optional(),
    budgetAud: z.number().min(0).max(1000).optional(),
    socialEnergy: z.enum(["low", "medium", "high"]).optional(),
    availability: z.array(AvailabilityOverrideSchema).max(10).optional(),
    proposedActivity: z.string().trim().max(200).nullable().optional(),
  })
  .strict()

export type MatchRequestBody = z.infer<typeof MatchRequestSchema>

export function requestedMeetupTime(body: MatchRequestBody): string | null {
  return body.availability?.[0]?.startAt ?? null
}
