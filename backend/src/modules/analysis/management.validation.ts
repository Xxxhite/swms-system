import { t, type Static } from "elysia"
export const reportParam = t.Object({
  report: t.Union([
    t.Literal("progress"),
    t.Literal("tasks"),
    t.Literal("approvals"),
    t.Literal("resources"),
  ]),
})
export type ReportKind = Static<typeof reportParam>["report"]
export const reportQuery = t.Object({
  projectId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  teamId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  indicatorId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  ownerId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  regionCode: t.Optional(t.String({ maxLength: 12 })),
  serviceFieldCode: t.Optional(t.String({ maxLength: 100 })),
  keyword: t.Optional(t.String({ maxLength: 150 })),
  status: t.Optional(t.String({ maxLength: 32 })),
  form: t.Optional(t.String({ maxLength: 32 })),
  unitType: t.Optional(t.String({ maxLength: 80 })),
  relationship: t.Optional(t.String({ maxLength: 20 })),
  dateFrom: t.Optional(t.String({ format: "date" })),
  dateTo: t.Optional(t.String({ format: "date" })),
  asOfDate: t.Optional(t.String({ format: "date" })),
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
  fingerprint: t.Optional(t.String({ pattern: "^[a-f0-9]{64}$" })),
  referenceTime: t.Optional(t.String({ format: "date-time" })),
  rowKey: t.Optional(t.String({ maxLength: 100 })),
})
export type ReportQuery = Static<typeof reportQuery>
