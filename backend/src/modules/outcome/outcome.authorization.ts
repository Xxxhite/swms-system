import type { BusinessState } from "@/modules/project/project.repository"
import { assertVersion, requirePermission, type Actor } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { executionTask, actualArranger } from "@/modules/execution/execution.authorization"
import { assertCurrentMembership } from "@/modules/service/service.service"

export function outcomeAccess(
  data: BusinessState,
  actor: Actor,
  taskId: number,
  permission = "service:monthly:view",
  write = false,
) {
  requirePermission(actor, permission)
  const task = executionTask(data, actor, taskId)
  const session = data.executions.sessions.find((s) => s.taskId === taskId)
  const actual =
    session?.snapshot.staff.some((s) => s.userId === actor.user.id) ||
    data.scheduling.staff.some((s) => s.taskId === taskId && s.userId === actor.user.id)
  if (!actual && !actualArranger(data, actor, task))
    throw AppError.forbidden("仅实际任务工作人员或业务负责人可整理来源档案")
  if (write) {
    if (task.executionMode === "SIMPLE" && task.leaderId !== actor.user.id)
      throw AppError.forbidden("仅任务负责人可维护执行登记档案")
    if (!session?.endedAt || session.status === "IN_PROGRESS")
      throw AppError.conflict("服务结束后再整理档案")
    const project = data.projects.find((p) => p.id === task.projectId && !p.deletedAt)
    if (!project) throw AppError.notFound()
    assertCurrentMembership(
      data,
      actor,
      project,
      task.teamId,
      "当前项目成员归属无效，不能维护来源档案",
    )
  }
  return task
}
export function outcomeFresh(
  data: BusinessState,
  snapshot: { data: { taskId: number; taskVersion: number; sourceVersion: number } },
) {
  const task = data.scheduling.tasks.find((t) => t.id === snapshot.data.taskId),
    session = data.executions.sessions.find((s) => s.taskId === snapshot.data.taskId)
  if (!task || !session) throw AppError.conflict("现场来源已失效")
  if (
    task.version !== snapshot.data.taskVersion ||
    session.sourceVersion !== snapshot.data.sourceVersion
  )
    throw AppError.conflict("现场来源已变化，请撤回后重新整理并提交")
}
export function outcomeVersion(actual: number, expected?: number) {
  if (expected === undefined) throw AppError.badRequest("请提供整理版本")
  assertVersion(actual, expected)
}
