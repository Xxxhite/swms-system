import { regionCodeBody } from "@/modules/region/region.validation"
import { t, type Static } from "elysia"
import { shortText } from "@/modules/project/project.validation"
const id = t.Integer({ minimum: 1 })
export const taskBody = t.Object({
  projectId: id,
  teamId: id,
  title: shortText(150, "任务标题"),
  form: t.Union([t.Literal("COLLECTIVE"), t.Literal("HOME_VISIT"), t.Literal("STATIONED")]),
  kind: t.Union([t.Literal("INDICATOR"), t.Literal("OTHER")]),
  pointId: t.Optional(t.Union([id, t.Null()])),
  location: shortText(150, "地点"),
  regionCode: regionCodeBody,
  address: t.String({ maxLength: 255 }),
  startAt: t.String({ maxLength: 40 }),
  endAt: t.String({ maxLength: 40 }),
  leaderId: id,
  staffIds: t.Array(id, { minItems: 1, maxItems: 100, uniqueItems: true }),
  expectedPeople: t.Integer({ minimum: 0, maximum: 1000000 }),
  description: t.String({ maxLength: 10000 }),
  evidence: t.String({ maxLength: 1000 }),
  indicators: t.Array(t.Object({ indicatorId: id, plannedValue: t.String({ maxLength: 14 }) }), {
    maxItems: 100,
  }),
  resources: t.Array(
    t.Object({
      resourceId: id,
      contactId: t.Optional(t.Union([id, t.Null()])),
      collaboration: shortText(1000, "协作说明"),
    }),
    { maxItems: 100 },
  ),
})
export const recurrenceBody = t.Object({
  frequency: t.Union([t.Literal("DAILY"), t.Literal("WEEKLY")]),
  until: t.String({ maxLength: 10 }),
  weekdays: t.Optional(
    t.Array(t.Integer({ minimum: 0, maximum: 6 }), { maxItems: 7, uniqueItems: true }),
  ),
})
export const confirmation = {
  previewToken: t.Optional(t.String({ maxLength: 64 })),
  conflictReason: t.Optional(t.String({ maxLength: 1000 })),
}
export const batchBody = t.Object({
  ...taskBody.properties,
  recurrence: t.Optional(recurrenceBody),
  requestKey: shortText(64, "请求标识"),
  ...confirmation,
})
export const previewBody = t.Object({
  ...taskBody.properties,
  recurrence: t.Optional(recurrenceBody),
  excludeId: t.Optional(id),
})
export const taskQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
  projectId: t.Optional(t.Numeric({ minimum: 1 })),
  teamId: t.Optional(t.Numeric({ minimum: 1 })),
  leaderId: t.Optional(t.Numeric({ minimum: 1 })),
  keyword: t.Optional(t.String({ maxLength: 150 })),
  form: t.Optional(t.String({ maxLength: 20 })),
  status: t.Optional(t.String({ maxLength: 20 })),
  from: t.Optional(t.String({ maxLength: 10 })),
  to: t.Optional(t.String({ maxLength: 10 })),
  mine: t.Optional(t.String({ maxLength: 5 })),
})
export type TaskInput = Static<typeof taskBody>
export type BatchInput = Static<typeof batchBody>
export type TaskQuery = Static<typeof taskQuery>
