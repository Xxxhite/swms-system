import { t, type Static } from "elysia"
import { shortText } from "@/modules/project/project.validation"
export const planBody = t.Object({
  targetId: t.Integer({ minimum: 1 }),
  mode: t.Union([t.Literal("MONTHLY"), t.Literal("MILESTONE")]),
  effectiveDate: t.String({ maxLength: 10 }),
  reason: shortText(1000, "计划原因"),
  periods: t.Optional(
    t.Array(
      t.Object({
        startDate: t.String({ maxLength: 10 }),
        endDate: t.String({ maxLength: 10 }),
        targetValue: t.String({ maxLength: 14 }),
      }),
      { minItems: 1, maxItems: 1200 },
    ),
  ),
})
export type PlanInput = Static<typeof planBody>
