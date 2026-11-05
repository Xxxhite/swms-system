import {
  projectRepository,
  type ProjectRepository,
  type BusinessState,
  type BusinessConnection,
} from "@/modules/project/project.repository"
import { requirePermission, assertVersion, type Actor } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { businessAudit } from "@/utils/business-audit"
import { fingerprint, instant } from "@/modules/task/task-calendar"
import {
  executionTask,
  assigned,
  canDetail,
  actualArranger,
  type ExecutionTask,
} from "./execution.authorization"
import {
  executionRead,
  executionWrite,
  sessionFor,
  sourceVersion,
  touchExecution,
  openExecution,
  legacyExecution,
  withinWindow,
  policyFor,
  supplementTime,
  bindEvidence,
  addException,
} from "./execution.shared"
import type { ParticipantInput, ParticipationInput } from "./execution.validation"

export function rosterFor(data: BusinessState, task: ExecutionTask, id: number) {
  const roster = data.executions.rosters.find((r) => r.taskId === task.id && r.id === id),
    person = data.executions.participants.find(
      (p) => p.id === roster?.participantId && p.projectId === task.projectId,
    )
  if (!roster || !person) throw AppError.notFound()
  return { roster, person }
}
export function participantWorker(
  data: BusinessState,
  actor: Actor,
  t: ExecutionTask,
  permission: string,
  at: Date,
) {
  return assigned(
    data,
    actor,
    t,
    permission,
    new Date(Math.min(Math.max(at.getTime(), t.startAt.getTime()), t.endAt.getTime() - 1)),
  )
}
export async function recordParticipation(
  tx: BusinessConnection,
  data: BusinessState,
  t: ExecutionTask,
  rosterId: number,
  value: {
    kind: "CONFIRM" | "CORRECT" | "VOID"
    method: "SELF" | "FAMILY" | "ASSISTED" | "SUPPLEMENT"
    actorId: number | null
    credentialId: number | null
    confirmerRole: "SELF" | "FAMILY" | "COMPANION" | "STAFF"
    relation: string
    reason: string
    occurredAt: Date
    receivedAt: Date
    requestKey: string
    requestOwner: string
    hash: string
    evidenceIds: number[]
  },
) {
  legacyExecution(t)
  const current = data.executions.participations.find((p) => p.rosterId === rosterId)
  if (value.kind !== "CONFIRM" && !current) throw AppError.conflict("尚无可更正或作废的参与记录")
  if (value.kind === "CONFIRM" && current?.status === "RECORDED")
    throw AppError.conflict("该对象已有参与记录，请使用更正操作")
  const flags: string[] = []
  if (value.method === "ASSISTED") flags.push("ASSISTED")
  if (value.method === "SUPPLEMENT") flags.push("SUPPLEMENT")
  if (value.kind !== "CONFIRM" || current) flags.push(value.kind === "VOID" ? "VOID" : "CORRECTION")
  const id = await tx.executions.participationEvents.insert({
    taskId: t.id,
    rosterId,
    kind: value.kind,
    method: value.method,
    actorId: value.actorId,
    credentialId: value.credentialId,
    confirmerRole: value.confirmerRole,
    relation: value.relation,
    reason: value.reason,
    occurredAt: value.occurredAt,
    receivedAt: value.receivedAt,
    flags,
    requestKey: value.requestKey,
    requestOwner: value.requestOwner,
    fingerprint: value.hash,
  })
  const fact = {
    currentEventId: id,
    status: value.kind === "VOID" ? ("VOID" as const) : ("RECORDED" as const),
    requiresReview: flags.length ? 1 : 0,
  }
  if (current)
    await tx.executions.participations.update(current.id, { ...fact, version: current.version + 1 })
  else await tx.executions.participations.insert({ ...fact, rosterId })
  if (value.actorId)
    await bindEvidence(tx, data, value.actorId, t.id, value.evidenceIds, "PARTICIPATION", id)
  const ownerId =
    value.actorId ?? data.executions.credentials.find((c) => c.id === value.credentialId)!.issuerId
  for (const flag of flags)
    await addException(tx, data, t, ownerId, flag, "PARTICIPATION", id, value.receivedAt)
  if (value.actorId === null)
    await tx.auditLogs.insert({
      actorId: null,
      action: "public-confirm-participation",
      entityType: "execution",
      entityId: t.id,
      afterData: { eventId: id, rosterId, method: value.method, kind: value.kind, flags },
    })
  else
    await businessAudit(tx, value.actorId, "record-participation", "execution", t.id, null, {
      eventId: id,
      rosterId,
      method: value.method,
      kind: value.kind,
      flags,
    })
  return { id, sourceVersion: await touchExecution(tx, data, t.id) }
}
export class ParticipantService {
  constructor(
    readonly repository: ProjectRepository = projectRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  list(actor: Actor, taskId: number) {
    return executionRead(this.repository, actor, (data) => {
      const current = data.actor!,
        t = executionTask(data, current, taskId, "service:participant:view")
      if (!canDetail(data, current, t)) throw AppError.forbidden()
      return data.executions.participants
        .filter((p) => p.projectId === t.projectId)
        .map((p) => ({
          ...p,
          phone: current.profile.permissions.includes("service:participant:contact")
            ? p.phone
            : undefined,
        }))
    })
  }
  create(actor: Actor, input: ParticipantInput) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(data, current, input.taskId, "service:participant:manage")
      if (t.projectId !== input.projectId) throw AppError.badRequest("对象与任务须属于同一合同包")
      participantWorker(data, current, t, "service:participant:manage", this.now())
      if (input.phone) requirePermission(current, "service:participant:contact")
      const code = `P-${fingerprint({ actorId: current.user.id, requestKey: input.requestKey }).slice(0, 36)}`,
        old = data.executions.participants.find(
          (p) => p.projectId === t.projectId && p.code === code,
        )
      if (old) {
        if (old.name !== input.name.trim() || old.phone !== (input.phone ?? "").trim())
          throw AppError.conflict("请求标识已用于其他对象资料")
        return { id: old.id }
      }
      const id = await tx.executions.participants.insert({
        projectId: t.projectId,
        code,
        name: input.name.trim(),
        phone: (input.phone ?? "").trim(),
        createdBy: current.user.id,
      })
      await businessAudit(
        tx,
        current.user.id,
        "create-service-participant",
        "participant",
        id,
        null,
        { projectId: t.projectId },
      )
      return {
        id,
        duplicateName: data.executions.participants.some(
          (p) =>
            p.projectId === t.projectId && p.name === input.name.trim() && p.status === "ACTIVE",
        ),
      }
    })
  }
  update(
    actor: Actor,
    id: number,
    input: { taskId: number; version: number; name: string; phone?: string; reason: string },
    archive = false,
  ) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(data, current, input.taskId, "service:participant:manage")
      participantWorker(data, current, t, "service:participant:manage", this.now())
      const p = data.executions.participants.find((p) => p.id === id && p.projectId === t.projectId)
      if (!p) throw AppError.notFound()
      assertVersion(p.version, input.version)
      if (!input.reason.trim()) throw AppError.badRequest("请填写资料调整原因")
      if (input.phone !== undefined) requirePermission(current, "service:participant:contact")
      const rosters = data.executions.rosters.filter((r) => r.participantId === id)
      const references = [
        ...rosters,
        ...data.executions.sessions
          .filter((session) =>
            session.registration?.indicators.some((r) => r.participantIds.includes(id)),
          )
          .map((session) => ({ taskId: session.taskId })),
      ]
      if (
        references.some(
          (r) =>
            r.taskId !== t.id &&
            !actualArranger(
              data,
              current,
              data.scheduling.tasks.find((t) => t.id === r.taskId)!,
            ),
        )
      )
        throw AppError.conflict("该对象有其他任务引用，请交项目负责人核对资料")
      await tx.executions.participants.update(id, {
        name: input.name.trim(),
        ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
        ...(archive ? { status: "ARCHIVED" as const } : {}),
        version: p.version + 1,
      })
      for (const taskId of new Set(references.map((r) => r.taskId))) {
        for (const c of data.executions.credentials.filter(
          (c) =>
            c.taskId === taskId &&
            rosters.some((r) => r.id === c.rosterId) &&
            c.status !== "REVOKED",
        ))
          await tx.executions.credentials.update(c.id, {
            status: "REVOKED",
            version: c.version + 1,
          })
        if (sessionFor(data, taskId)) await touchExecution(tx, data, taskId)
      }
      await businessAudit(
        tx,
        current.user.id,
        archive ? "archive-service-participant" : "update-service-participant",
        "participant",
        id,
        null,
        { reason: input.reason },
      )
      return { id }
    })
  }
  addRoster(actor: Actor, taskId: number, participantId: number) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(data, current, taskId, "service:participant:manage")
      legacyExecution(t)
      participantWorker(data, current, t, "service:participant:manage", this.now())
      if (
        t.status === "CANCELED" ||
        (sessionFor(data, taskId) && sessionFor(data, taskId)!.status !== "IN_PROGRESS")
      )
        throw AppError.conflict("当前任务不再接受新增名单")
      const p = data.executions.participants.find(
        (p) => p.id === participantId && p.projectId === t.projectId && p.status === "ACTIVE",
      )
      if (!p) throw AppError.notFound()
      const old = data.executions.rosters.find(
        (r) => r.taskId === taskId && r.participantId === participantId,
      )
      if (old) return { id: old.id }
      const id = await tx.executions.rosters.insert({
        taskId,
        participantId,
        createdBy: current.user.id,
      })
      if (sessionFor(data, taskId)) await touchExecution(tx, data, taskId)
      await businessAudit(
        tx,
        current.user.id,
        "add-execution-participant",
        "execution",
        taskId,
        null,
        { rosterId: id, participantId },
      )
      return { id }
    })
  }
  confirm(actor: Actor, taskId: number, rosterId: number, input: ParticipationInput) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(
        data,
        current,
        taskId,
        input.method === "SUPPLEMENT" ? "service:execution:supplement" : "service:execution:record",
      )
      const owner = `USER:${current.user.id}`,
        hash = fingerprint({ taskId, rosterId, input }),
        old = data.executions.participationEvents.find(
          (e) => e.requestOwner === owner && e.requestKey === input.requestKey,
        )
      const now = this.now(),
        at = input.method === "SUPPLEMENT" ? instant(input.occurredAt) : now
      assigned(
        data,
        current,
        t,
        input.method === "SUPPLEMENT" ? "service:execution:supplement" : "service:execution:record",
        new Date(Math.min(Math.max(at.getTime(), t.startAt.getTime()), t.endAt.getTime() - 1)),
        input.method === "SUPPLEMENT",
      )
      if (old) {
        if (old.fingerprint !== hash) throw AppError.conflict("请求标识已用于其他参与操作")
        return { id: old.id, sourceVersion: sessionFor(data, taskId)!.sourceVersion }
      }
      if (input.method !== "SUPPLEMENT") {
        openExecution(data, t)
        withinWindow(t, policyFor(data, t), now)
      } else supplementTime(data, t, at, now)
      sourceVersion(data, taskId, input.sourceVersion)
      const { person } = rosterFor(data, t, rosterId)
      if (person.status !== "ACTIVE" && input.kind !== "VOID") throw AppError.conflict("对象已归档")
      if (!input.reason.trim()) throw AppError.badRequest("辅助登记、更正或作废须填写原因")
      if (t.form === "HOME_VISIT" && input.kind !== "VOID" && !input.evidenceIds.length)
        throw AppError.badRequest("入户辅助确认须至少提供一份替代凭证")
      if (["FAMILY", "COMPANION"].includes(input.confirmerRole) && !input.relation.trim())
        throw AppError.badRequest("请填写确认人与对象的关系")
      const result = await recordParticipation(tx, data, t, rosterId, {
        kind: input.kind,
        method: input.method,
        actorId: current.user.id,
        credentialId: null,
        confirmerRole: input.confirmerRole,
        relation: input.relation.trim(),
        reason: input.reason.trim(),
        occurredAt: at,
        receivedAt: now,
        requestKey: input.requestKey,
        requestOwner: owner,
        hash,
        evidenceIds: input.evidenceIds,
      })
      if (input.kind === "VOID")
        for (const c of data.executions.credentials.filter(
          (c) => c.rosterId === rosterId && c.status !== "REVOKED",
        ))
          await tx.executions.credentials.update(c.id, {
            status: "REVOKED",
            version: c.version + 1,
          })
      return result
    })
  }
}
