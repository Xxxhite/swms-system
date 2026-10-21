import { t, type Static } from "elysia"
import { quantity } from "@/modules/project/project.validation"
export const monthlyBody = t.Object({
  indicatorId: t.Integer({ minimum: 1 }),
  teamId: t.Integer({ minimum: 1 }),
  month: t.String({ pattern: "^\\d{4}-(0[1-9]|1[0-2])$" }),
  actualValue: quantity,
  note: t.Optional(t.String({ maxLength: 1000 })),
})
export const monthlyChangeBody = t.Object({
  version: t.Integer({ minimum: 1 }),
  operation: t.Union([t.Literal("CORRECT"), t.Literal("DELETE"), t.Literal("RESTORE")]),
  actualValue: t.Optional(quantity),
  note: t.Optional(t.String({ maxLength: 1000 })),
  reason: t.String({ minLength: 1, maxLength: 1000 }),
})
export type MonthlyInput = Static<typeof monthlyBody>
export type MonthlyChangeInput = Static<typeof monthlyChangeBody>
