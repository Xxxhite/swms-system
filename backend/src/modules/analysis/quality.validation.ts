import { t, type Static } from "elysia"
export const qualityParam = t.Object({
  kind: t.Union([t.Literal("service"), t.Literal("cooperation")]),
})
export type QualityKind = Static<typeof qualityParam>["kind"]
export const qualityQuery = t.Object({
  projectId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  teamId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  resourceId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  dateFrom: t.Optional(t.String({ format: "date" })),
  dateTo: t.Optional(t.String({ format: "date" })),
  keyword: t.Optional(t.String({ maxLength: 150 })),
  relationship: t.Optional(
    t.Union([t.Literal("CURRENT"), t.Literal("HISTORICAL"), t.Literal("POTENTIAL")]),
  ),
  rating: t.Optional(
    t.Union([
      t.Literal("SATISFIED"),
      t.Literal("GENERAL"),
      t.Literal("NEEDS_IMPROVEMENT"),
      t.Literal("UNRATED"),
    ]),
  ),
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
  fingerprint: t.Optional(t.String({ pattern: "^[a-f0-9]{64}$" })),
})
export type QualityQuery = Static<typeof qualityQuery>
