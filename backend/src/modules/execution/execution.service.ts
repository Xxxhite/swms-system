import { outcomeTaskState } from "@/modules/outcome/outcome.status"
import { pageResult } from "@/modules/project/project.validation"
import {
  projectRepository,
  type ProjectRepository,
  type BusinessConnection,
  type BusinessState,
} from "@/modules/project/project.repository"
import { requirePermission, assertVersion, type Actor } from "@/utils/authorization"
import { managementPositions } from "@/modules/identity/identity.constants"
import { qualifiedStaff } from "@/modules/task/task.authorization"
import { businessDate, fingerprint, instant } from "@/modules/task/task-calendar"
import { businessAudit } from "@/utils/business-audit"
import { AppError } from "@/utils/errors"
import {
  executionTask,
  executionArranger,
  actualArranger,
  assigned,
  canDetail,
  type ExecutionTask,
} from "./execution.authorization"
import { geoChecks, validatePolicy, exceptionLabels } from "./execution-geo"
import {
  executionRead,
  executionWrite,
  sessionFor,
  policyFor,
  sourceVersion,
  touchExecution,
  openExecution,
  withinWindow,
  supplementTime,
  currentStaffEvents,
  bindEvidence,
  addException,
} from "./execution.shared"
import type { AttendanceInput, LifecycleInput, PolicyInput } from "./execution.validation"

function eventTime(task: ExecutionTask, at: Date) {
  return new Date(
    Math.min(Math.max(at.getTime(), task.startAt.getTime()), task.endAt.getTime() - 1),
  )
}
function can(work: () => unknown) {
  try {
    work()
    return true
  } catch {
    return false
  }
}
export class ExecutionService {
  constructor(
    readonly repository: ProjectRepository = projectRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  mine(actor: Actor, query: { page?: number; pageSize?: number }) {
    return executionRead(this.repository, actor, (data) => {
      const current = data.actor!
      requirePermission(current, "service:execution:view")
      const tasks = data.scheduling.tasks
        .filter(
          (t) =>
            data.projects.some((p) => p.id === t.projectId && !p.deletedAt) &&
            data.scheduling.staff.some((s) => s.taskId === t.id && s.userId === current.user.id),
        )
        .sort((a, b) => b.startAt.getTime() - a.startAt.getTime() || b.id - a.id)
        .map((t) => {
          return {
            id: t.id,
            title: t.title,
            projectId: t.projectId,
            projectName: data.projects.find((p) => p.id === t.projectId)?.name,
            teamId: t.teamId,
            form: t.form,
            location: t.location,
            startAt: t.startAt,
            endAt: t.endAt,
            leaderId: t.leaderId,
            state: outcomeTaskState(data, t.id).state,
          }
        })
      return pageResult(tasks, query)
    })
  }
  detail(actor: Actor, taskId: number) {
    return executionRead(this.repository, actor, (data) => {
      const current = data.actor!,
        t = executionTask(data, current, taskId),
        session = sessionFor(data, taskId),
        p = policyFor(data, t),
        detail = canDetail(data, current, t)
      const isAssigned = can(() =>
        assigned(data, current, t, "service:execution:record", eventTime(t, this.now())),
      )
      const normalWindow = can(() => withinWindow(t, p, this.now()))
      const isLeader = isAssigned && t.leaderId === current.user.id
      const canConfigure =
        !session &&
        t.status !== "CANCELED" &&
        can(() => executionArranger(data, current, t, "service:execution:configure"))
      const effective = currentStaffEvents(data, taskId),
        mine = effective.filter((e) => e.userId === current.user.id)
      const canRoster = detail && current.profile.permissions.includes("service:participant:view")
      const rosters = canRoster
        ? data.executions.rosters
            .filter((r) => r.taskId === taskId)
            .map((r) => {
              const person = data.executions.participants.find((p) => p.id === r.participantId)!,
                fact = data.executions.participations.find((f) => f.rosterId === r.id)
              return {
                ...r,
                person: {
                  id: person.id,
                  code: person.code,
                  name: person.name,
                  status: person.status,
                  phone: current.profile.permissions.includes("service:participant:contact")
                    ? person.phone
                    : undefined,
                },
                participation: fact ?? null,
              }
            })
        : []
      const ids = data.executions.rosters.filter((r) => r.taskId === taskId).map((r) => r.id),
        facts = data.executions.participations.filter(
          (f) => ids.includes(f.rosterId) && f.status === "RECORDED",
        )
      const precise = actualArranger(data, current, t) || isLeader
      return {
        task: {
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          teamId: t.teamId,
          form: t.form,
          location: t.location,
          startAt: t.startAt,
          endAt: t.endAt,
          leaderId: t.leaderId,
        },
        taskId,
        taskVersion: t.version,
        policy: { ...p, ...(!detail && !canConfigure ? { latitude: null, longitude: null } : {}) },
        policyVersion: data.executions.policies.find((p) => p.taskId === taskId)?.version ?? 0,
        policyStale:
          !session &&
          !!data.executions.policies.find(
            (p) =>
              p.taskId === taskId &&
              (p.taskVersion !== t.version ||
                (p.settings.pointId !== null &&
                  data.points.find((point) => point.id === p.settings.pointId)?.version !==
                    p.settings.pointVersion)),
          ),
        session: session
          ? {
              id: session.id,
              status: session.status,
              startedAt: session.startedAt,
              endedAt: session.endedAt,
              sourceVersion: session.sourceVersion,
            }
          : null,
        sourceVersion: session?.sourceVersion ?? 0,
        state: outcomeTaskState(data, t.id).state,
        summary: {
          registered: facts.length,
          requiresReview: facts.filter((f) => f.requiresReview).length,
          openExceptions: data.executions.exceptions.filter(
            (e) => e.taskId === taskId && e.status !== "RESOLVED",
          ).length,
        },
        attendance: detail
          ? data.executions.staffEvents
              .filter((e) => e.taskId === taskId)
              .map((e) => ({
                ...e,
                requestKey: undefined,
                fingerprint: undefined,
                userName: data.identity.users.find((u) => u.id === e.userId)?.name,
                current: effective.some((x) => x.id === e.id),
                geo: precise || e.userId === current.user.id ? e.geo : null,
                distance: precise || e.userId === current.user.id ? e.distance : null,
              }))
          : [],
        rosters,
        participationEvents: canRoster
          ? data.executions.participationEvents
              .filter((e) => e.taskId === taskId)
              .map((e) => ({
                ...e,
                requestKey: undefined,
                requestOwner: undefined,
                fingerprint: undefined,
              }))
          : [],
        exceptions:
          detail && current.profile.permissions.includes("service:exception:view")
            ? data.executions.exceptions
                .filter((e) => e.taskId === taskId)
                .map((e) => ({ ...e, label: exceptionLabels[e.code] ?? e.code }))
            : [],
        canRecord:
          isAssigned &&
          normalWindow &&
          session?.status === "IN_PROGRESS" &&
          t.status !== "CANCELED",
        canConfigure,
        canOrganize: detail && current.profile.permissions.includes("service:monthly:view"),
        canStart:
          normalWindow &&
          !session &&
          isLeader &&
          t.status !== "CANCELED" &&
          current.profile.permissions.includes("service:execution:manage"),
        canCheckIn:
          normalWindow &&
          isAssigned &&
          session?.status === "IN_PROGRESS" &&
          t.status !== "CANCELED" &&
          !mine.some((e) => e.kind === "CHECK_IN"),
        canCheckOut:
          normalWindow &&
          isAssigned &&
          !!session &&
          session.status !== "STOPPED" &&
          t.status !== "CANCELED" &&
          mine.some((e) => e.kind === "CHECK_IN") &&
          !mine.some((e) => e.kind === "CHECK_OUT"),
        canEnd:
          normalWindow &&
          isLeader &&
          session?.status === "IN_PROGRESS" &&
          current.profile.permissions.includes("service:execution:manage"),
        canStop:
          session?.status === "IN_PROGRESS" &&
          ((isLeader && current.profile.permissions.includes("service:execution:manage")) ||
            (actualArranger(data, current, t) &&
              can(() => executionArranger(data, current, t, "activity:task:cancel")))),
        canManageParticipants:
          isAssigned &&
          t.status !== "CANCELED" &&
          (!session || session.status === "IN_PROGRESS") &&
          current.profile.permissions.includes("service:participant:manage"),
        canIssue:
          normalWindow &&
          isAssigned &&
          session?.status === "IN_PROGRESS" &&
          current.profile.permissions.includes("service:credential:issue"),
        canSupplement:
          !!session &&
          can(() => assigned(data, current, t, "service:execution:supplement", t.startAt, true)) &&
          this.now().getTime() <= t.endAt.getTime() + p.supplementHours * 3600000,
      }
    })
  }
  savePolicy(actor: Actor, taskId: number, input: PolicyInput) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(data, current, taskId, "service:execution:configure")
      executionArranger(data, current, t, "service:execution:configure")
      assertVersion(t.version, input.taskVersion)
      if (t.status === "CANCELED") throw AppError.conflict("任务已取消")
      if (sessionFor(data, taskId)) throw AppError.conflict("服务已开始，现场规则快照保持不变")
      const old = data.executions.policies.find((p) => p.taskId === taskId)
      assertVersion(old?.version ?? 0, input.version)
      const { version, taskVersion, reason, ...settings } = input
      void version
      void taskVersion
      const point = data.points.find((p) => p.id === t.pointId && !p.deletedAt),
        policy = { ...settings, pointId: point?.id ?? null, pointVersion: point?.version ?? null }
      validatePolicy(policy)
      const values = {
        taskId,
        settings: policy,
        taskVersion: t.version + 1,
        updatedBy: current.user.id,
      }
      if (old) await tx.executions.policies.update(old.id, { ...values, version: old.version + 1 })
      else await tx.executions.policies.insert(values)
      await tx.scheduling.tasks.update(taskId, { version: t.version + 1 })
      await businessAudit(tx, current.user.id, "configure-execution", "execution", taskId, null, {
        reason,
        taskVersion: t.version + 1,
      })
      return { taskId }
    })
  }
  private replay(
    data: BusinessState,
    actor: Actor,
    taskId: number,
    operation: string,
    input: AttendanceInput | LifecycleInput,
  ) {
    const old = data.executions.staffEvents.find(
      (e) => e.userId === actor.user.id && e.requestKey === input.requestKey,
    )
    if (!old) return
    if (old.fingerprint !== fingerprint({ taskId, operation, input }))
      throw AppError.conflict("请求标识已用于其他现场记录")
    return {
      id: old.id,
      sourceVersion: sessionFor(data, taskId)?.sourceVersion ?? 0,
      replayed: true,
    }
  }
  private async record(
    tx: BusinessConnection,
    data: BusinessState,
    actor: Actor,
    t: ExecutionTask,
    input: AttendanceInput,
    operation: string,
    hashInput: AttendanceInput | LifecycleInput = input,
  ) {
    const now = this.now(),
      p = policyFor(data, t),
      declaredAt = instant(input.declaredAt),
      occurredAt = input.method === "NORMAL" ? now : declaredAt
    assigned(
      data,
      actor,
      t,
      input.method === "NORMAL" ? "service:execution:record" : "service:execution:supplement",
      eventTime(t, occurredAt),
      input.method !== "NORMAL",
    )
    if (input.method === "NORMAL") {
      if (t.status === "CANCELED") throw AppError.conflict("任务已取消，普通到离记录已关闭")
      const session = sessionFor(data, t.id)
      if (
        !session ||
        session.status === "STOPPED" ||
        (input.kind === "CHECK_IN" && session.status !== "IN_PROGRESS")
      )
        throw AppError.conflict("当前执行状态不接受本次到离操作")
      withinWindow(t, p, now)
    } else {
      supplementTime(data, t, occurredAt, now)
      if (!input.reason.trim()) throw AppError.badRequest("补录或更正须填写原因")
    }
    const effective = currentStaffEvents(data, t.id),
      own = effective.filter((e) => e.userId === actor.user.id),
      old = own.find((e) => e.kind === input.kind)
    if (input.method === "CORRECTION") {
      if (!old || old.id !== input.supersedesId)
        throw AppError.conflict("只能更正本人当前生效的同类到离来源")
    } else if (old || input.supersedesId)
      throw AppError.conflict("本人该类记录已存在，请使用明确的更正操作")
    const checkIn = own.find((e) => e.kind === "CHECK_IN"),
      checkOut = own.find((e) => e.kind === "CHECK_OUT")
    if (input.kind === "CHECK_OUT" && (!checkIn || occurredAt < checkIn.occurredAt))
      throw AppError.conflict("请先记录到岗，离岗不得早于到岗")
    if (input.kind === "CHECK_IN" && checkOut && occurredAt > checkOut.occurredAt)
      throw AppError.conflict("更正到岗不得晚于当前离岗")
    const checks = geoChecks(p, input.geo, now, declaredAt),
      flags = checks.flags.filter((f) => input.method === "NORMAL" || f !== "CLOCK_SKEW")
    if (input.method !== "NORMAL") flags.push(input.method)
    if (
      input.kind === "CHECK_IN" &&
      occurredAt.getTime() > t.startAt.getTime() + p.toleranceMinutes * 60000
    )
      flags.push("LATE")
    if (
      input.kind === "CHECK_OUT" &&
      occurredAt.getTime() < t.endAt.getTime() - p.toleranceMinutes * 60000
    )
      flags.push("EARLY")
    if ((input.geo.status !== "OK" || flags.includes("NO_REFERENCE_POINT")) && !input.reason.trim())
      throw AppError.badRequest("定位缺失或未设参考点，请填写现场说明")
    const id = await tx.executions.staffEvents.insert({
      taskId: t.id,
      userId: actor.user.id,
      kind: input.kind,
      method: input.method,
      slotKey: old ? `correction:${old.id}` : "initial",
      supersedesId: old?.id ?? null,
      occurredAt,
      declaredAt,
      receivedAt: now,
      geo: input.geo,
      distance: checks.distance,
      flags,
      reason: input.reason.trim(),
      requestKey: input.requestKey,
      fingerprint: fingerprint({ taskId: t.id, operation, input: hashInput }),
    })
    await bindEvidence(tx, data, actor.user.id, t.id, input.evidenceIds, "STAFF", id)
    for (const code of flags) await addException(tx, data, t, actor.user.id, code, "STAFF", id, now)
    if (input.kind === "CHECK_OUT")
      for (const issue of data.executions.exceptions.filter(
        (e) =>
          e.taskId === t.id &&
          e.ownerId === actor.user.id &&
          e.code === "MISSING_CHECKOUT" &&
          e.status !== "RESOLVED",
      ))
        await tx.executions.exceptions.update(issue.id, {
          status: "RESOLVED",
          resolvedByEventId: id,
          version: issue.version + 1,
        })
    await businessAudit(tx, actor.user.id, "record-staff-attendance", "execution", t.id, null, {
      eventId: id,
      kind: input.kind,
      method: input.method,
      flags,
    })
    return id
  }
  start(actor: Actor, taskId: number, input: LifecycleInput) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(data, current, taskId, "service:execution:manage")
      assigned(data, current, t, "service:execution:manage", eventTime(t, this.now()))
      if (t.status === "CANCELED") throw AppError.conflict("任务已取消")
      const replay = this.replay(data, current, taskId, "start", input)
      if (replay) return replay
      sourceVersion(data, taskId, input.sourceVersion)
      if (t.leaderId !== current.user.id || sessionFor(data, taskId))
        throw AppError.conflict("仅任务负责人可开启尚未开始的服务")
      const p = policyFor(data, t)
      validatePolicy(p)
      withinWindow(t, p, this.now())
      const configured = data.executions.policies.find((p) => p.taskId === taskId),
        point = data.points.find((x) => x.id === p.pointId)
      if (
        configured &&
        (configured.taskVersion !== t.version || (p.pointId && point?.version !== p.pointVersion))
      )
        throw AppError.conflict("安排或服务点已变化，请先重新核对现场规则")
      const ids = data.scheduling.staff.filter((s) => s.taskId === taskId).map((s) => s.userId),
        valid = qualifiedStaff(
          data,
          t.projectId,
          t.teamId,
          businessDate(t.startAt),
          businessDate(new Date(t.endAt.getTime() - 1)),
        )
      if (ids.some((id) => !valid.some((u) => u.id === id)))
        throw AppError.conflict("工作人员资格已变化，请先重新安排")
      const staff = ids.map((userId) => {
        const u = valid.find((u) => u.id === userId)!,
          m = data.members.find(
            (m) => m.projectId === t.projectId && m.teamId === t.teamId && m.userId === userId,
          )
        return {
          userId,
          name: u.name,
          supervisorId: u.supervisorId,
          startDate: managementPositions.includes(u.positionCode ?? "")
            ? businessDate(t.startAt)
            : (m?.startDate ?? businessDate(t.startAt)),
          endDate: managementPositions.includes(u.positionCode ?? "")
            ? businessDate(t.endAt)
            : (m?.endDate ?? businessDate(t.endAt)),
          management: managementPositions.includes(u.positionCode ?? ""),
        }
      })
      const snapshot = {
        taskVersion: t.version + 1,
        startAt: t.startAt.toISOString(),
        endAt: t.endAt.toISOString(),
        location: t.location,
        address: t.address,
        policy: p,
        staff,
        indicators: data.scheduling.indicators
          .filter((i) => i.taskId === taskId)
          .map((i) => ({
            indicatorId: i.indicatorId,
            planId: i.planId,
            periodId: i.periodId,
            plannedValue: i.plannedValue,
          })),
      }
      const now = this.now(),
        id = await tx.executions.sessions.insert({
          taskId,
          status: "IN_PROGRESS",
          snapshot,
          startedBy: current.user.id,
          startedAt: now,
        })
      data.executions.sessions.push({
        id,
        taskId,
        status: "IN_PROGRESS",
        snapshot,
        startedBy: current.user.id,
        startedAt: now,
        endedAt: null,
        endedBy: null,
        stopReason: null,
        endRequestKey: null,
        endFingerprint: null,
        stopRequestKey: null,
        stopFingerprint: null,
        sourceVersion: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      await tx.scheduling.tasks.update(taskId, { version: t.version + 1 })
      t.version++
      const eventId = await this.record(
        tx,
        data,
        current,
        t,
        { ...input, kind: "CHECK_IN", method: "NORMAL" },
        "start",
        input,
      )
      return { id: eventId, sourceVersion: await touchExecution(tx, data, taskId), replayed: false }
    })
  }
  attendance(actor: Actor, taskId: number, input: AttendanceInput) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(
        data,
        current,
        taskId,
        input.method === "NORMAL" ? "service:execution:record" : "service:execution:supplement",
      )
      if (t.status === "CANCELED" && input.method === "NORMAL")
        throw AppError.conflict("任务已取消，普通到离记录已关闭")
      assigned(
        data,
        current,
        t,
        input.method === "NORMAL" ? "service:execution:record" : "service:execution:supplement",
        eventTime(t, input.method === "NORMAL" ? this.now() : instant(input.declaredAt)),
        input.method !== "NORMAL",
      )
      const replay = this.replay(data, current, taskId, "attendance", input)
      if (replay) return replay
      sourceVersion(data, taskId, input.sourceVersion)
      const id = await this.record(tx, data, current, t, input, "attendance")
      return { id, sourceVersion: await touchExecution(tx, data, taskId), replayed: false }
    })
  }
  end(actor: Actor, taskId: number, input: LifecycleInput) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(data, current, taskId, "service:execution:manage")
      assigned(data, current, t, "service:execution:manage", eventTime(t, this.now()))
      if (t.status === "CANCELED") throw AppError.conflict("任务已取消")
      if (t.leaderId !== current.user.id) throw AppError.forbidden("仅任务负责人可结束服务")
      const existingSession = sessionFor(data, taskId)
      const ownOut = currentStaffEvents(data, taskId).find(
        (e) => e.userId === current.user.id && e.kind === "CHECK_OUT",
      )
      if (
        existingSession?.status === "ENDED" &&
        existingSession.endRequestKey === input.requestKey
      ) {
        if (existingSession.endFingerprint !== fingerprint(input))
          throw AppError.conflict("结束请求已变化")
        return { id: ownOut!.id, sourceVersion: existingSession.sourceVersion, replayed: true }
      }
      const session = openExecution(data, t)
      sourceVersion(data, taskId, input.sourceVersion)
      withinWindow(t, policyFor(data, t), this.now())
      let id: number
      if (ownOut) {
        id = ownOut.id
        await bindEvidence(tx, data, current.user.id, taskId, input.evidenceIds, "STAFF", id)
      } else {
        id = await this.record(
          tx,
          data,
          current,
          t,
          { ...input, kind: "CHECK_OUT", method: "NORMAL" },
          "end",
          input,
        )
      }
      const now = this.now()
      await tx.executions.sessions.update(session.id, {
        status: "ENDED",
        endRequestKey: input.requestKey,
        endFingerprint: fingerprint(input),
        endedAt: now,
        endedBy: current.user.id,
      })
      const effective = currentStaffEvents(data, taskId),
        checked = effective.filter((e) => e.kind === "CHECK_OUT").map((e) => e.userId)
      for (const e of effective.filter(
        (e) => e.kind === "CHECK_IN" && e.userId !== current.user.id && !checked.includes(e.userId),
      ))
        await addException(tx, data, t, e.userId, "MISSING_CHECKOUT", "SESSION", session.id, now)
      for (const c of data.executions.credentials.filter(
        (c) => c.taskId === taskId && c.status !== "REVOKED",
      ))
        await tx.executions.credentials.update(c.id, { status: "REVOKED", version: c.version + 1 })
      await businessAudit(tx, current.user.id, "end-execution", "execution", taskId, null, {
        eventId: id,
      })
      return { id, sourceVersion: await touchExecution(tx, data, taskId), replayed: false }
    })
  }
  stop(
    actor: Actor,
    taskId: number,
    input: { sourceVersion: number; requestKey: string; reason: string },
  ) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(data, current, taskId, "service:execution:manage"),
        session = sessionFor(data, taskId)
      if (!input.reason.trim()) throw AppError.badRequest("请填写中止原因")
      const leader =
        t.leaderId === current.user.id &&
        can(() => assigned(data, current, t, "service:execution:manage", eventTime(t, this.now())))
      if (!leader) {
        executionArranger(data, current, t, "activity:task:cancel")
        if (!actualArranger(data, current, t))
          throw AppError.forbidden("仅实际任务负责人或项目／团队安排人可中止服务")
      }
      if (session?.stopRequestKey === input.requestKey) {
        if (session.stopFingerprint !== fingerprint(input))
          throw AppError.conflict("中止请求已变化")
        return { id: session.id, sourceVersion: session.sourceVersion }
      }
      if (!session || session.status !== "IN_PROGRESS")
        throw AppError.conflict("当前服务不在进行中")
      sourceVersion(data, taskId, input.sourceVersion)
      const now = this.now()
      await tx.executions.sessions.update(session.id, {
        status: "STOPPED",
        endedAt: now,
        endedBy: current.user.id,
        stopReason: input.reason.trim(),
        stopRequestKey: input.requestKey,
        stopFingerprint: fingerprint(input),
      })
      await tx.scheduling.tasks.update(taskId, { status: "CANCELED", version: t.version + 1 })
      for (const c of data.executions.credentials.filter(
        (c) => c.taskId === taskId && c.status !== "REVOKED",
      ))
        await tx.executions.credentials.update(c.id, { status: "REVOKED", version: c.version + 1 })
      const events = currentStaffEvents(data, taskId)
      for (const e of events.filter(
        (e) =>
          e.kind === "CHECK_IN" &&
          !events.some((o) => o.userId === e.userId && o.kind === "CHECK_OUT"),
      ))
        await addException(tx, data, t, e.userId, "MISSING_CHECKOUT", "SESSION", session.id, now)
      await tx.scheduling.events.insert({
        taskId,
        actorId: current.user.id,
        action: "CANCEL",
        reason: input.reason.trim(),
        afterData: { status: "CANCELED", executionSessionId: session.id },
      })
      await businessAudit(tx, current.user.id, "stop-execution", "execution", taskId, null, {
        reason: input.reason.trim(),
      })
      return { id: session.id, sourceVersion: await touchExecution(tx, data, taskId) }
    })
  }
}
