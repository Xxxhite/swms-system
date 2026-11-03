import type { BusinessState } from "@/modules/project/project.repository"
import type { Actor } from "@/utils/authorization"
import { requirePermission } from "@/utils/authorization"
import { responsibleFor } from "@/utils/business-scope"
import { taskReadable, taskManage, qualifiedStaff } from "@/modules/task/task.authorization"
import { businessDate } from "@/modules/task/task-calendar"
import { AppError } from "@/utils/errors"
export type ExecutionTask = BusinessState["scheduling"]["tasks"][number]
export function executionTask(
  data: BusinessState,
  actor: Actor,
  id: number,
  permission = "service:execution:view",
) {
  requirePermission(actor, permission)
  const task = data.scheduling.tasks.find((t) => t.id === id)
  if (!task || !taskReadable(data, actor, task.projectId, task.teamId)) throw AppError.notFound()
  return task
}
export function executionArranger(
  data: BusinessState,
  actor: Actor,
  task: ExecutionTask,
  permission: string,
) {
  return taskManage(data, actor, task.projectId, task.teamId, permission)
}
export function actualArranger(data: BusinessState, actor: Actor, task: ExecutionTask) {
  const p = data.projects.find((p) => p.id === task.projectId && !p.deletedAt)
  if (p && responsibleFor(actor, p)) return true
  if (actor.user.positionCode !== "position-4" || actor.profile.teamId !== task.teamId) return false
  try {
    taskManage(
      data,
      { ...actor, profile: { ...actor.profile, isDevSuperadmin: false } },
      task.projectId,
      task.teamId,
      "service:execution:view",
    )
    return true
  } catch {
    return false
  }
}
export function assigned(
  data: BusinessState,
  actor: Actor,
  task: ExecutionTask,
  permission: string,
  at: Date,
  historical = false,
) {
  requirePermission(actor, permission)
  const snapshot = data.executions.sessions.find((s) => s.taskId === task.id)?.snapshot
  const day = businessDate(at)
  const staff = data.scheduling.staff.some(
    (s) => s.taskId === task.id && s.userId === actor.user.id,
  )
  const prior = snapshot?.staff.find((s) => s.userId === actor.user.id)
  const qualified = historical
    ? !!prior && prior.startDate <= day && prior.endDate >= day
    : staff &&
      qualifiedStaff(data, task.projectId, task.teamId, day, day).some(
        (u) => u.id === actor.user.id,
      )
  if (!qualified) throw AppError.forbidden("仅任务实际分派且在服务期间有效的工作人员可执行")
  return actor.user.id
}
export function canDetail(data: BusinessState, actor: Actor, task: ExecutionTask) {
  return (
    actualArranger(data, actor, task) ||
    data.scheduling.staff.some((s) => s.taskId === task.id && s.userId === actor.user.id)
  )
}
