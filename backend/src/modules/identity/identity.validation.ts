import { t } from "elysia"
import { accountStatuses, dataScopes, orgTypes } from "@/db/schema"

export const text = (max = 100) => t.String({ minLength: 1, maxLength: max, pattern: "\\S" })
export const nullableText = (max = 100) => t.Optional(t.Union([text(max), t.Null()]))
export const id = t.Integer({ minimum: 1 })
export const version = { version: id }
export const idParams = t.Object({ id: t.Numeric({ minimum: 1, multipleOf: 1 }) })
const enumOf = <T extends string>(values: readonly T[]) =>
  t.Union(values.map((value) => t.Literal(value)))
export const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1, default: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1, maximum: 100, default: 20 })),
  keyword: t.Optional(t.String({ maxLength: 100 })),
  status: t.Optional(enumOf(accountStatuses)),
})
export const authorizationFields = {
  roleIds: t.Array(id, { maxItems: 50 }),
  extraPermissions: t.Array(text(), { maxItems: 100 }),
  dataScope: enumOf(dataScopes),
  managedOrgIds: t.Array(id, { maxItems: 100 }),
}
export const placementFields = {
  orgId: id,
  positionCode: text(32),
  supervisorId: t.Union([id, t.Null()]),
}
export const registrationFields = {
  name: text(50),
  phone: text(32),
  arrivalDate: t.String({ format: "date" }),
  major: text(),
  proposedPosition: text(),
  education: text(),
  politicalStatus: text(),
  socialWorkerNo: nullableText(),
  serviceFieldCode: nullableText(),
  proposedTeam: nullableText(),
}
export const password = t.String({ minLength: 8, maxLength: 128 })
export const orgFields = {
  code: t.String({ minLength: 1, maxLength: 32, pattern: "^[a-zA-Z0-9_-]+$" }),
  name: text(),
  parentId: t.Union([id, t.Null()]),
  type: enumOf(orgTypes),
  status: t.Union([t.Literal("ACTIVE"), t.Literal("DISABLED")]),
  sortOrder: t.Integer(),
}
export const roleFields = {
  code: t.String({ minLength: 1, maxLength: 32, pattern: "^[a-z][a-z0-9_-]*$" }),
  name: text(),
  description: t.String({ maxLength: 1000 }),
  status: t.Union([t.Literal("ACTIVE"), t.Literal("DISABLED")]),
}
