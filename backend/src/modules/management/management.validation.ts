import { t, type Static } from "elysia"
import { shortText, versionBody, idParam } from "@/modules/project/project.validation"
export { idParam }
export const managementQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
  projectId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  teamId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  ownerId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  keyword: t.Optional(t.String({ maxLength: 150 })),
  status: t.Optional(
    t.Union([t.Literal("OPEN"), t.Literal("IN_PROGRESS"), t.Literal("COMPLETED")]),
  ),
  dateFrom: t.Optional(t.String({ format: "date" })),
  dateTo: t.Optional(t.String({ format: "date" })),
})
export const sourceType = t.Union([
  t.Literal("PROJECT"),
  t.Literal("INDICATOR"),
  t.Literal("PLAN"),
  t.Literal("TASK"),
  t.Literal("RECORD"),
])
export const fields = {
  title: shortText(150, "问题标题"),
  description: shortText(2000, "问题描述"),
  ownerId: t.Integer({ minimum: 1 }),
  dueDate: t.String({ format: "date" }),
  requestKey: shortText(64, "请求标识"),
}
export const createBody = t.Object({
  ...fields,
  projectId: t.Integer({ minimum: 1 }),
  teamId: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  sourceType,
  sourceId: t.Integer({ minimum: 1 }),
})
export const updateBody = t.Object({
  ...fields,
  ...versionBody.properties,
  reason: shortText(1000, "变更原因"),
})
export const transitionBody = t.Object({
  ...versionBody.properties,
  requestKey: shortText(64, "请求标识"),
  action: t.Union([
    t.Literal("START"),
    t.Literal("NOTE"),
    t.Literal("COMPLETE"),
    t.Literal("REOPEN"),
  ]),
  note: shortText(2000, "处理说明"),
})
export type ManagementInput = Static<typeof createBody>
export type ManagementUpdate = Static<typeof updateBody>
export type ManagementQuery = Static<typeof managementQuery>
export type ManagementTransition = Static<typeof transitionBody>
