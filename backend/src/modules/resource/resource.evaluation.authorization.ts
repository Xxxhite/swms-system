import type { Actor } from "@/utils/authorization"
import { canReadResource } from "./resource.service"
import { canMaintainProject, responsibleFor } from "@/utils/business-scope"
import type { FeedbackState } from "@/modules/feedback/feedback.repository"
import { businessDate } from "@/modules/task/task-calendar"
export type Cooperation = FeedbackState["cooperations"][number]
export function evaluationReadable(data: FeedbackState, actor: Actor, c: Cooperation) {
  const r = data.resources.find((r) => r.id === c.resourceId && r.status !== "MERGED")
  if (!actor.profile.permissions.includes("resource:view") || !r || !canReadResource(actor, r))
    return false
  if (!c.projectId) return c.type !== "CONTRACT"
  const p = data.projects.find(
    (p) => p.id === c.projectId && !p.deletedAt && (c.type !== "CONTRACT" || p.status === "ACTIVE"),
  )
  return (
    !!p &&
    (canMaintainProject(actor, p) ||
      data.teams.some((t) => t.projectId === p.id && t.teamId === actor.profile.teamId))
  )
}
export function evaluationApplicable(c: Cooperation, today = businessDate()) {
  return (
    c.status === "ENDED" ||
    (c.status === "AGREED" && !!c.startDate && c.startDate <= today) ||
    (c.status === "TERMINATED" && !!c.wasEffective)
  )
}
export function evaluationOwner(
  data: FeedbackState,
  actor: Actor,
  c: Cooperation,
  today = businessDate(),
) {
  const r = data.resources.find((r) => r.id === c.resourceId)
  const p = data.projects.find((p) => p.id === c.projectId && !p.deletedAt)
  return (
    evaluationReadable(data, actor, c) &&
    r?.status === "ACTIVE" &&
    evaluationApplicable(c, today) &&
    actor.profile.permissions.includes("resource:cooperation:evaluate") &&
    (r.maintainerId === actor.user.id ||
      (c.type === "MANUAL" ? c.ownerId === actor.user.id : !!p && responsibleFor(actor, p)))
  )
}
