import { t, type Static } from "elysia"
import { quantity, shortText } from "@/modules/project/project.validation"
const id = t.Integer({ minimum: 1 })
export const registrationBody = t.Object({
  requestKey: shortText(64, "请求标识"),
  taskVersion: t.Integer({ minimum: 1 }),
  sourceVersion: t.Integer({ minimum: 0 }),
  outcomeVersion: t.Integer({ minimum: 0 }),
  startAt: t.String({ maxLength: 40 }),
  endAt: t.String({ maxLength: 40 }),
  summary: shortText(4000, "服务总结"),
  reason: t.Optional(t.String({ maxLength: 1000 })),
  evidenceIds: t.Array(id, { maxItems: 100, uniqueItems: true }),
  indicators: t.Array(
    t.Object({
      indicatorId: id,
      value: quantity,
      participantIds: t.Array(id, { maxItems: 1000, uniqueItems: true }),
      intervals: t.Array(
        t.Object({
          userId: id,
          startAt: t.String({ maxLength: 40 }),
          endAt: t.String({ maxLength: 40 }),
        }),
        { maxItems: 200 },
      ),
    }),
    { maxItems: 100 },
  ),
})
export type RegistrationInput = Static<typeof registrationBody>
