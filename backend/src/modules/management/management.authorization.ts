import type { Actor } from "@/utils/authorization"
import { responsibleFor, isManagement } from "@/utils/business-scope"
import { taskReadable, qualifiedStaff } from "@/modules/task/task.authorization"
import { canReadReport } from "@/modules/service/service.service"
import type { ManagementState, ManagementRow } from "./management.repository"
import type { ManagementInput } from "./management.validation"
import { businessToday } from "@/modules/service/indicator-calculation"
export function actualManager(
  data: ManagementState,
  actor: Actor,
  projectId: number,
  teamId: number | null,
) {
  const p = data.projects.find((p) => p.id === projectId && !p.deletedAt)
  return (
    !!p &&
    (responsibleFor(actor, p) ||
      (!!teamId &&
        actor.user.positionCode === "position-4" &&
        actor.profile.teamId === teamId &&
        data.members.some(
          (m) =>
            m.userId === actor.user.id &&
            m.projectId === projectId &&
            m.teamId === teamId &&
            m.startDate <= businessToday() &&
            m.endDate >= businessToday(),
        )))
  )
}
export function sourceReadable(
  data: ManagementState,
  actor: Actor,
  row: Pick<ManagementInput, "projectId" | "teamId" | "sourceId" | "sourceType">,
) {
  const p = data.projects.find((p) => p.id === row.projectId && !p.deletedAt)
  if (
    !p ||
    (row.teamId !== null &&
      !data.teams.some((t) => t.projectId === p.id && t.teamId === row.teamId))
  )
    return false
  const has = (p: string) => actor.profile.permissions.includes(p)
  const scope =
    row.teamId === null
      ? responsibleFor(actor, p) || !!actor.profile.isDevSuperadmin
      : taskReadable(data, actor, p.id, row.teamId)
  if (
    !scope ||
    (isManagement(actor) && !responsibleFor(actor, p) && !actor.profile.isDevSuperadmin)
  )
    return false
  if (row.sourceType === "PROJECT") return row.sourceId === p.id && has("project:record:view")
  if (row.sourceType === "INDICATOR")
    return (
      has("service:indicator:view") &&
      data.indicators.some((i) => i.id === row.sourceId && i.projectId === p.id && !i.deletedAt)
    )
  if (row.sourceType === "PLAN")
    return (
      has("service:plan:view") &&
      data.scheduling.plans.some(
        (plan) =>
          plan.id === row.sourceId &&
          plan.projectId === p.id &&
          data.targets.some(
            (t) => t.id === plan.targetId && (row.teamId === null || t.teamId === row.teamId),
          ),
      )
    )
  if (row.sourceType === "TASK")
    return (
      has("activity:view") &&
      data.scheduling.tasks.some(
        (t) =>
          t.id === row.sourceId &&
          t.projectId === p.id &&
          (row.teamId === null || t.teamId === row.teamId) &&
          taskReadable(data, actor, p.id, t.teamId),
      )
    )
  return (
    has("service:monthly:view") &&
    data.reports.some(
      (r) =>
        r.id === row.sourceId &&
        canReadReport(data, actor, r) &&
        data.indicators.some((i) => i.id === r.indicatorId && i.projectId === p.id) &&
        (row.teamId === null || r.teamId === row.teamId),
    )
  )
}
export function canReadFollowup(data: ManagementState, actor: Actor, row: ManagementRow) {
  return (
    actor.profile.permissions.includes("management:followup:view") &&
    sourceReadable(data, actor, row) &&
    (actualManager(data, actor, row.projectId, row.teamId) ||
      !!actor.profile.isDevSuperadmin ||
      row.ownerId === actor.user.id ||
      row.createdBy === actor.user.id)
  )
}
export function eligibleOwners(
  data: ManagementState,
  row: Pick<ManagementInput, "projectId" | "teamId" | "sourceId" | "sourceType">,
) {
  const today = businessToday()
  return data.identity.users.filter(
    (u) =>
      u.status === "ACTIVE" &&
      (row.teamId === null
        ? data.projects.some(
            (p) =>
              p.id === row.projectId &&
              [p.directorId, p.seniorDirectorId, p.supervisorId].includes(u.id),
          )
        : qualifiedStaff(data, row.projectId, row.teamId, today, today).some((x) => x.id === u.id)),
  )
}
export function sourceHref(row: Pick<ManagementInput, "projectId" | "sourceId" | "sourceType">) {
  if (row.sourceType === "PROJECT" || row.sourceType === "INDICATOR")
    return `/service/contract-package-projects/${row.projectId}`
  if (row.sourceType === "TASK") return `/activity/${row.sourceId}`
  if (row.sourceType === "PLAN") return `/service/plans/${row.sourceId}`
  return `/service/records?recordId=${row.sourceId}`
}
