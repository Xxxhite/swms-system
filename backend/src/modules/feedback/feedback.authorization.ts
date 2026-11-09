import type { Actor } from "@/utils/authorization"
import { requirePermission } from "@/utils/authorization"
import {
  executionTask,
  canDetail,
  type ExecutionTask,
} from "@/modules/execution/execution.authorization"
import { qualifiedStaff } from "@/modules/task/task.authorization"
import { businessDate } from "@/modules/task/task-calendar"
import { AppError } from "@/utils/errors"
import type { FeedbackState } from "./feedback.repository"
export function feedbackTask(data: FeedbackState, actor: Actor, id: number) {
  requirePermission(actor, "service:execution:view")
  const task = executionTask(data, actor, id, "service:feedback:view")
  if (!canDetail(data, actor, task)) throw AppError.forbidden("无权查看本任务反馈")
  return task
}
export function applicableFeedback(data: FeedbackState, task: ExecutionTask, now = new Date()) {
  const session = data.executions.sessions.find((s) => s.taskId === task.id)
  return (
    task.form === "COLLECTIVE" &&
    task.status !== "CANCELED" &&
    session?.status === "ENDED" &&
    !!session.endedAt &&
    session.endedAt <= now
  )
}
export function feedbackOwner(
  data: FeedbackState,
  actor: Actor,
  task: ExecutionTask,
  now = new Date(),
) {
  requirePermission(actor, "service:feedback:manage")
  const today = businessDate(now)
  if (
    actor.user.id !== task.leaderId ||
    !data.scheduling.staff.some((s) => s.taskId === task.id && s.userId === actor.user.id) ||
    !qualifiedStaff(data, task.projectId, task.teamId, today, today).some(
      (u) => u.id === actor.user.id,
    )
  )
    throw AppError.forbidden("仅实际分派且当前项目资格有效的任务负责人可登记反馈")
}
