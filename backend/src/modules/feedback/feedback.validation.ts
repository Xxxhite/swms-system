import { t, type Static } from "elysia"
export const feedbackReason = t.String({ minLength: 1, maxLength: 1000 })
export const feedbackRequest = {
  version: t.Integer({ minimum: 0 }),
  requestKey: t.String({ minLength: 8, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }),
  reason: t.Optional(t.String({ maxLength: 1000 })),
}
export const feedbackBody = t.Object({
  ...feedbackRequest,
  satisfiedCount: t.Integer({ minimum: 0, maximum: 100000 }),
  neutralCount: t.Integer({ minimum: 0, maximum: 100000 }),
  dissatisfiedCount: t.Integer({ minimum: 0, maximum: 100000 }),
  source: t.Union([t.Literal("PAPER"), t.Literal("ORAL"), t.Literal("PHONE"), t.Literal("OTHER")]),
  sourceNote: t.String({ maxLength: 500 }),
  feedbackDate: t.String({ format: "date" }),
  suggestions: t.String({ maxLength: 2000 }),
})
export const feedbackVoidBody = t.Object({ ...feedbackRequest, reason: feedbackReason })
export type FeedbackInput = Static<typeof feedbackBody>
export type FeedbackVoidInput = Static<typeof feedbackVoidBody>
