import { t } from "elysia"
export const regionCodeBody = t.Optional(
  t.Union([t.String({ minLength: 1, maxLength: 24 }), t.Null()]),
)
export const regionQuery = {
  regionCode: t.Optional(t.String({ minLength: 1, maxLength: 24 })),
  regionUnmapped: t.Optional(t.Literal("1")),
}
