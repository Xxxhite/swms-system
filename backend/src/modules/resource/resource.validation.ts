import { regionCodeBody, regionQuery } from "@/modules/region/region.validation"
import { t, type Static } from "elysia"
import { shortText, listQuery } from "./resource.shared"
import { cooperationStatuses } from "@/db/schema/resource"
const optionalText = (length: number) => t.Optional(t.String({ maxLength: length }))
const optionalId = t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()]))
const optionalDate = t.Optional(
  t.Union([t.String({ format: "date", error: "请选择有效日期" }), t.Null()]),
)
export const resourceBody = t.Object({
  name: shortText(150, "单位名称"),
  creditCode: optionalText(32),
  unitType: shortText(50, "单位类型"),
  regionCode: regionCodeBody,
  region: t.Optional(t.String({ maxLength: 100 })),
  address: optionalText(255),
  description: optionalText(5000),
  source: optionalText(100),
  capabilityCodes: t.Optional(t.Array(shortText(50), { maxItems: 30 })),
  serviceFieldCodes: t.Optional(t.Array(shortText(100), { maxItems: 23 })),
  intention: optionalText(1000),
  ownerOrgId: t.Integer({ minimum: 1 }),
  maintainerId: t.Integer({ minimum: 1 }),
  requestKey: optionalText(64),
})
export const contactBody = t.Object({
  name: shortText(100, "联系人姓名"),
  position: optionalText(100),
  phone: optionalText(50),
  email: optionalText(150),
  note: optionalText(1000),
  isPrimary: t.Boolean(),
  status: t.Union([t.Literal("ACTIVE"), t.Literal("ARCHIVED")]),
})
export const cooperationBody = t.Object({
  title: shortText(150, "合作事项"),
  ownerId: t.Integer({ minimum: 1 }),
  status: t.Union(cooperationStatuses.map((value) => t.Literal(value))),
  startDate: optionalDate,
  endDate: optionalDate,
  basis: optionalText(1000),
  result: optionalText(2000),
  feedback: optionalText(2000),
  projectId: optionalId,
  reason: optionalText(1000),
})
export const followupBody = t.Object({
  cooperationId: optionalId,
  contactId: optionalId,
  occurredAt: t.String({ format: "date-time", error: "请选择有效跟进时间" }),
  method: shortText(50, "联系方法"),
  content: shortText(2000, "沟通内容"),
  result: optionalText(2000),
  nextAction: optionalText(1000),
  nextOwnerId: optionalId,
  nextDueDate: optionalDate,
  completed: t.Boolean(),
})
export const mergeBody = t.Object({
  sourceId: t.Integer({ minimum: 1 }),
  targetId: t.Integer({ minimum: 1 }),
  sourceVersion: t.Integer({ minimum: 1 }),
  targetVersion: t.Integer({ minimum: 1 }),
  reason: shortText(1000, "合并原因"),
})
export const resourceQuery = t.Object({
  ...regionQuery,
  ...listQuery.properties,
  region: optionalText(100),
  unitType: optionalText(50),
  capability: optionalText(50),
  relationship: t.Optional(
    t.Union([t.Literal("POTENTIAL"), t.Literal("CURRENT"), t.Literal("HISTORICAL")]),
  ),
  maintainerId: t.Optional(t.Numeric({ minimum: 1 })),
  overdue: t.Optional(t.Union([t.Literal("1"), t.Literal("0")])),
})
export type ResourceInput = Static<typeof resourceBody>
export type ContactInput = Static<typeof contactBody>
export type CooperationInput = Static<typeof cooperationBody>
export type FollowupInput = Static<typeof followupBody>
export type MergeInput = Static<typeof mergeBody>
export type ResourceQuery = Static<typeof resourceQuery>
