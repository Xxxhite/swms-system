import { t, type Static } from "elysia"
import { shortText } from "@/modules/project/project.validation"
const id = t.Integer({ minimum: 1 }),
  text = (max: number) => t.String({ maxLength: max })
export const requestFields = {
  requestKey: shortText(64, "请求标识"),
  sourceVersion: t.Integer({ minimum: 0 }),
}
export const geoBody = t.Object({
  status: t.Union([
    t.Literal("OK"),
    t.Literal("DENIED"),
    t.Literal("UNAVAILABLE"),
    t.Literal("TIMEOUT"),
    t.Literal("UNSUPPORTED"),
  ]),
  latitude: t.Optional(t.Number({ minimum: -90, maximum: 90 })),
  longitude: t.Optional(t.Number({ minimum: -180, maximum: 180 })),
  accuracy: t.Optional(t.Number({ minimum: 0, maximum: 1000000 })),
  sampledAt: t.Optional(text(40)),
})
export const attendanceBody = t.Object({
  ...requestFields,
  kind: t.Union([t.Literal("CHECK_IN"), t.Literal("CHECK_OUT")]),
  method: t.Union([t.Literal("NORMAL"), t.Literal("SUPPLEMENT"), t.Literal("CORRECTION")]),
  declaredAt: text(40),
  geo: geoBody,
  reason: text(1000),
  supersedesId: t.Optional(id),
  evidenceIds: t.Array(id, { maxItems: 10, uniqueItems: true }),
})
export const lifecycleBody = t.Object({
  ...requestFields,
  declaredAt: text(40),
  geo: geoBody,
  reason: text(1000),
  evidenceIds: t.Array(id, { maxItems: 10, uniqueItems: true }),
})
export const policyBody = t.Object({
  version: t.Integer({ minimum: 0 }),
  taskVersion: id,
  reason: shortText(1000, "规则调整原因"),
  latitude: t.Union([t.Number({ minimum: -90, maximum: 90 }), t.Null()]),
  longitude: t.Union([t.Number({ minimum: -180, maximum: 180 }), t.Null()]),
  radius: t.Integer({ minimum: 50, maximum: 5000 }),
  accuracyLimit: t.Integer({ minimum: 10, maximum: 1000 }),
  beforeMinutes: t.Integer({ minimum: 0, maximum: 120 }),
  afterMinutes: t.Integer({ minimum: 0, maximum: 360 }),
  toleranceMinutes: t.Integer({ minimum: 0, maximum: 120 }),
  credentialMinutes: t.Integer({ minimum: 5, maximum: 60 }),
  supplementHours: t.Integer({ minimum: 1, maximum: 72 }),
})
export const participantBody = t.Object({
  projectId: id,
  taskId: id,
  name: shortText(100, "姓名或称呼"),
  phone: t.Optional(text(50)),
  requestKey: shortText(64, "请求标识"),
})
export const participationBody = t.Object({
  ...requestFields,
  method: t.Union([t.Literal("ASSISTED"), t.Literal("SUPPLEMENT")]),
  kind: t.Union([t.Literal("CONFIRM"), t.Literal("CORRECT"), t.Literal("VOID")]),
  confirmerRole: t.Union([
    t.Literal("SELF"),
    t.Literal("FAMILY"),
    t.Literal("COMPANION"),
    t.Literal("STAFF"),
  ]),
  relation: text(200),
  reason: shortText(1000, "登记原因"),
  occurredAt: text(40),
  evidenceIds: t.Array(id, { maxItems: 10, uniqueItems: true }),
})
export const tokenBody = t.Object({
  token: t.String({ minLength: 43, maxLength: 43, pattern: "^[A-Za-z0-9_-]+$" }),
})
export const publicConfirmBody = t.Object({
  ...tokenBody.properties,
  requestKey: shortText(64, "请求标识"),
  confirmerRole: t.Union([t.Literal("SELF"), t.Literal("FAMILY"), t.Literal("COMPANION")]),
  relation: text(200),
})
export type AttendanceInput = Static<typeof attendanceBody>
export type LifecycleInput = Static<typeof lifecycleBody>
export type PolicyInput = Static<typeof policyBody>
export type ParticipantInput = Static<typeof participantBody>
export type ParticipationInput = Static<typeof participationBody>
export type PublicConfirmInput = Static<typeof publicConfirmBody>
