import type { BusinessState } from "@/modules/project/project.repository"
import { canMaintainProject } from "@/utils/business-scope"
import { teamFor, requirePermission, type Actor } from "@/utils/authorization"
import { managementPositions } from "@/modules/identity/identity.constants"
import { AppError } from "@/utils/errors"
import { businessDate } from "./task-calendar"

export function taskReadable(data: BusinessState, actor: Actor, projectId: number, teamId: number) {
  const project = data.projects.find((p) => p.id === projectId && !p.deletedAt)
  return (
    !!project &&
    (canMaintainProject(actor, project) ||
      (actor.profile.teamId === teamId &&
        data.teams.some((t) => t.projectId === projectId && t.teamId === teamId)))
  )
}
export function taskManage(
  data: BusinessState,
  actor: Actor,
  projectId: number,
  teamId: number,
  permission: string,
) {
  requirePermission(actor, permission)
  const project = data.projects.find((p) => p.id === projectId && !p.deletedAt)
  if (!project || !taskReadable(data, actor, projectId, teamId))
    throw AppError.notFound("项目或团队不存在或无权访问")
  const today = businessDate()
  const leader =
    actor.user.positionCode === "position-4" &&
    actor.profile.teamId === teamId &&
    data.members.some(
      (m) =>
        m.projectId === projectId &&
        m.teamId === teamId &&
        m.userId === actor.user.id &&
        m.startDate <= today &&
        m.endDate >= today,
    )
  if (!canMaintainProject(actor, project) && !leader)
    throw AppError.forbidden("仅项目负责人或本团队主任可维护执行安排")
  if (!data.teams.some((t) => t.projectId === projectId && t.teamId === teamId))
    throw AppError.badRequest("团队不属于该项目")
  return project
}
export function qualifiedStaff(
  data: BusinessState,
  projectId: number,
  teamId: number,
  start: string,
  end: string,
) {
  const project = data.projects.find((p) => p.id === projectId && !p.deletedAt)
  if (!project) return []
  return data.identity.users.filter((u) => {
    if (u.status !== "ACTIVE") return false
    if (
      managementPositions.includes(u.positionCode ?? "") &&
      [project.directorId, project.seniorDirectorId, project.supervisorId].includes(u.id)
    )
      return true
    return (
      teamFor(data.identity.orgs, u.orgId)?.id === teamId &&
      data.members.some(
        (m) =>
          m.projectId === projectId &&
          m.teamId === teamId &&
          m.userId === u.id &&
          m.startDate <= start &&
          m.endDate >= end,
      )
    )
  })
}
