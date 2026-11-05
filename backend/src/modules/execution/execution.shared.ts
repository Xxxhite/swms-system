import { AppError, ErrorCode } from "@/utils/errors"
import { assertVersion, type Actor } from "@/utils/authorization"
import type {
  BusinessConnection,
  BusinessState,
  ProjectRepository,
} from "@/modules/project/project.repository"
import type { ExecutionPolicy } from "@/db/schema"
import { defaultPolicy } from "./execution-geo"
import type { ExecutionTask } from "./execution.authorization"
export async function safeExecution<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error(
      "[execution]",
      crypto.randomUUID(),
      error && typeof error === "object" && "code" in error ? String(error.code) : "INTERNAL",
    )
    throw new AppError(ErrorCode.INTERNAL, "现场记录处理失败，请稍后重试")
  }
}
export function executionWrite<T>(
  repository: ProjectRepository,
  actor: Actor,
  work: (tx: BusinessConnection, data: BusinessState, current: Actor) => Promise<T>,
) {
  return safeExecution(() => repository.write(actor, work))
}
export function executionRead<T>(
  repository: ProjectRepository,
  actor: Actor,
  work: (data: BusinessState) => Promise<T> | T,
) {
  return safeExecution(() => repository.read(actor, work))
}
export function sessionFor(data: BusinessState, taskId: number) {
  return data.executions.sessions.find((s) => s.taskId === taskId)
}
export function policyFor(data: BusinessState, t: ExecutionTask): ExecutionPolicy {
  const session = sessionFor(data, t.id)
  if (session)
    return {
      ...session.snapshot.policy,
      locationCheckEnabled: session.snapshot.policy.locationCheckEnabled ?? true,
    }
  const saved = data.executions.policies.find((p) => p.taskId === t.id)
  if (saved)
    return { ...saved.settings, locationCheckEnabled: saved.settings.locationCheckEnabled ?? true }
  const point = data.points.find((p) => p.id === t.pointId && !p.deletedAt)
  return {
    ...defaultPolicy,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    radius: point?.radius ?? defaultPolicy.radius,
    pointId: point?.id ?? null,
    pointVersion: point?.version ?? null,
  }
}
export function sourceVersion(data: BusinessState, taskId: number, expected: number) {
  assertVersion(sessionFor(data, taskId)?.sourceVersion ?? 0, expected)
}
export async function touchExecution(tx: BusinessConnection, data: BusinessState, taskId: number) {
  const session = sessionFor(data, taskId)
  if (!session) throw AppError.conflict("服务尚未开始")
  session.sourceVersion++
  session.version++
  await tx.executions.sessions.update(session.id, {
    sourceVersion: session.sourceVersion,
    version: session.version,
  })
  return session.sourceVersion
}
export function legacyExecution(t: ExecutionTask) {
  if (t.executionMode === "SIMPLE") throw AppError.conflict("本任务请使用执行登记")
}
export function openExecution(data: BusinessState, t: ExecutionTask) {
  legacyExecution(t)
  const session = sessionFor(data, t.id)
  if (t.status === "CANCELED" || !session || session.status !== "IN_PROGRESS")
    throw AppError.conflict("本次服务未开放或已经结束／中止")
  return session
}
export function withinWindow(t: ExecutionTask, p: ExecutionPolicy, now: Date) {
  if (
    now.getTime() < t.startAt.getTime() - p.beforeMinutes * 60000 ||
    now.getTime() > t.endAt.getTime() + p.afterMinutes * 60000
  )
    throw AppError.conflict("当前不在允许的现场操作时段")
}
export function supplementTime(data: BusinessState, t: ExecutionTask, occurredAt: Date, now: Date) {
  const session = sessionFor(data, t.id),
    p = policyFor(data, t)
  if (!session || now.getTime() > t.endAt.getTime() + p.supplementHours * 3600000)
    throw AppError.conflict("已超过允许的补录期限或服务尚未开始")
  if (
    occurredAt > now ||
    occurredAt.getTime() < t.startAt.getTime() - p.beforeMinutes * 60000 ||
    occurredAt.getTime() > t.endAt.getTime() + p.afterMinutes * 60000 ||
    (session.status === "STOPPED" && session.endedAt && occurredAt > session.endedAt)
  )
    throw AppError.badRequest("补录发生时间超出本次服务范围")
}
export function currentStaffEvents(data: BusinessState, taskId: number) {
  const events = data.executions.staffEvents.filter((e) => e.taskId === taskId),
    replaced = new Set(events.map((e) => e.supersedesId))
  return events.filter((e) => !replaced.has(e.id))
}
export async function bindEvidence(
  tx: BusinessConnection,
  data: BusinessState,
  actorId: number,
  taskId: number,
  ids: number[],
  kind: "STAFF" | "PARTICIPATION" | "EXCEPTION",
  boundId: number,
) {
  for (const id of ids) {
    const f = data.executions.evidence.find(
      (f) =>
        f.id === id &&
        f.taskId === taskId &&
        f.uploadedBy === actorId &&
        !f.deletedAt &&
        !f.boundKind,
    )
    if (!f) throw AppError.forbidden("凭证须为本人上传且属于本任务的未绑定文件")
    await tx.executions.evidence.update(id, { boundKind: kind, boundId, version: f.version + 1 })
    f.boundKind = kind
    f.boundId = boundId
  }
}
export async function addException(
  tx: BusinessConnection,
  data: BusinessState,
  t: ExecutionTask,
  ownerId: number,
  code: string,
  kind: "STAFF" | "PARTICIPATION" | "SESSION",
  sourceId: number,
  now: Date,
) {
  const key = `${kind}:${sourceId}:${code}:${ownerId}`,
    old = data.executions.exceptions.find((e) => e.taskId === t.id && e.sourceKey === key)
  if (old) return old.id
  const owner = data.identity.users.find((u) => u.id === ownerId)
  const id = await tx.executions.exceptions.insert({
    taskId: t.id,
    sourceKey: key,
    code,
    ownerId,
    reviewerId: owner?.supervisorId ?? null,
    sourceKind: kind,
    sourceId,
    notes: [],
    createdAt: now,
    updatedAt: now,
  })
  return id
}
