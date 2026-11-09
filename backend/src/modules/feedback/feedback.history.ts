import { fingerprint } from "@/modules/task/task-calendar"
import { AppError } from "@/utils/errors"
import type { FeedbackState } from "./feedback.repository"
type RequestRecord = { requestKey: string; hash: string; result: { id: number; version: number } }
export function replay(
  data: FeedbackState,
  entityType: string,
  entityId: number,
  actorId: number,
  input: { requestKey: string },
) {
  for (const e of data.qualityEvents.filter(
    (e) => e.entityType === entityType && e.entityId === entityId,
  )) {
    const saved = e.afterData as RequestRecord | null
    if (saved?.requestKey !== input.requestKey) continue
    if (e.actorId !== actorId || saved.hash !== fingerprint(input))
      throw AppError.conflict("请求标识已用于其他内容")
    return saved.result
  }
}
export function qualityHistory(data: FeedbackState, type: string, id: number) {
  return data.qualityEvents
    .filter((e) => e.entityType === type && e.entityId === id)
    .map((e) => {
      const value = e.afterData as { value: unknown; reason: string } | null
      return {
        id: e.id,
        action: e.action,
        actorName: data.identity.users.find((u) => u.id === e.actorId)?.name ?? "原登记人",
        createdAt: e.createdAt,
        reason: value?.reason ?? "",
        value: value?.value,
      }
    })
}
