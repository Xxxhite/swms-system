import { t, type Static } from "elysia"
import { quantity, shortText } from "@/modules/project/project.validation"
export const calculationModes = t.Union([
  t.Literal("MANUAL"),
  t.Literal("SCENES"),
  t.Literal("VISITS"),
  t.Literal("PEOPLE"),
  t.Literal("STAFF_HOURS"),
])
export const ruleBody = t.Object({
  mode: calculationModes,
  effectiveDate: t.String({ format: "date" }),
  revision: t.Integer({ minimum: 0 }),
  reason: shortText(1000, "口径设置原因"),
})
export const outcomeBody = t.Object({
  version: t.Integer({ minimum: 1 }),
  sourceVersion: t.Integer({ minimum: 1 }),
  summary: t.String({ maxLength: 4000 }),
  manualValues: t.Record(t.String({ pattern: "^[0-9]+$" }), quantity),
  evidenceIds: t.Array(t.Integer({ minimum: 1 }), { maxItems: 100 }),
})
export const outcomeSubmitBody = t.Object({
  version: t.Integer({ minimum: 1 }),
  sourceVersion: t.Integer({ minimum: 1 }),
  recordIds: t.Array(t.Integer({ minimum: 1 }), { maxItems: 100 }),
  requestKey: t.String({ minLength: 1, maxLength: 64 }),
})
export const outcomeDecisions = t.Array(
  t.Object({
    key: t.String({ minLength: 1, maxLength: 100 }),
    decision: t.Union([t.Literal("ACCEPT"), t.Literal("EXCLUDE")]),
    reason: shortText(1000, "核验依据"),
  }),
  { maxItems: 5000 },
)
export const outcomeReviewBody = t.Object({
  version: t.Integer({ minimum: 1 }),
  decisions: outcomeDecisions,
  comment: t.Optional(t.String({ maxLength: 1000 })),
  previewToken: t.Optional(t.String({ maxLength: 64 })),
})
export type RuleInput = Static<typeof ruleBody>
export type OutcomeInput = Static<typeof outcomeBody>
export type OutcomeSubmitInput = Static<typeof outcomeSubmitBody>
export type OutcomeReviewInput = Static<typeof outcomeReviewBody>
