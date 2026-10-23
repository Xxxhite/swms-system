import { t, type Static } from "elysia"
import { quantity, shortText } from "@/modules/project/project.validation"
export const monthlyBody = t.Object({
  indicatorId: t.Integer({ minimum: 1, error: "请选择填报指标" }),
  teamId: t.Integer({ minimum: 1, error: "请选择填报团队" }),
  month: t.String({
    pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
    error: "填报月份须为有效的 YYYY-MM 格式",
  }),
  actualValue: quantity,
  note: t.Optional(t.String({ maxLength: 1000 })),
})
export const monthlyChangeBody = t.Object({
  version: t.Integer({ minimum: 1 }),
  operation: t.Union([t.Literal("CORRECT"), t.Literal("DELETE"), t.Literal("RESTORE")]),
  actualValue: t.Optional(quantity),
  note: t.Optional(t.String({ maxLength: 1000 })),
  reason: shortText(1000, "变更原因"),
})
export type MonthlyInput = Static<typeof monthlyBody>
export type MonthlyChangeInput = Static<typeof monthlyChangeBody>
