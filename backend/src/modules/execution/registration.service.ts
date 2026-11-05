import {
  projectRepository,
  type ProjectRepository,
  type BusinessState,
} from "@/modules/project/project.repository"
import { requirePermission, assertVersion, type Actor } from "@/utils/authorization"
import { businessAudit } from "@/utils/business-audit"
import { AppError } from "@/utils/errors"
import { decimalText, decimalUnits } from "@/utils/decimal"
import { businessDate, fingerprint, instant } from "@/modules/task/task-calendar"
import { qualifiedStaff } from "@/modules/task/task.authorization"
import { OutcomeService } from "@/modules/outcome/outcome.service"
import { calculationRule, outcomeSource } from "@/modules/outcome/outcome.source"
import { sourceView } from "@/modules/outcome/outcome.service"
import { outcomeTaskState } from "@/modules/outcome/outcome.status"
import { executionTask, canDetail, type ExecutionTask } from "./execution.authorization"
import { executionRead, executionWrite, policyFor, sessionFor } from "./execution.shared"
import type { ExecutionRegistration, ExecutionSnapshot } from "@/db/schema/execution"
import type { RegistrationInput } from "./registration.validation"

function simpleTask(data: BusinessState, actor: Actor, id: number) {
  const task = executionTask(data, actor, id)
  if (task.executionMode !== "SIMPLE") throw AppError.conflict("原任务请使用原现场记录流程")
  if (!canDetail(data, actor, task)) throw AppError.forbidden("无权查看本任务执行明细")
  return task
}
function owner(data: BusinessState, actor: Actor, t: ExecutionTask) {
  for (const permission of [
    "service:execution:manage",
    "service:monthly:create",
    "service:monthly:update",
  ])
    requirePermission(actor, permission)
  if (
    actor.user.id !== t.leaderId ||
    !data.scheduling.staff.some((s) => s.taskId === t.id && s.userId === actor.user.id)
  )
    throw AppError.forbidden("仅实际分派的任务负责人可登记执行结果")
}
function rulesFor(data: BusinessState, t: ExecutionTask, date: string) {
  const session = sessionFor(data, t.id),
    outcome = data.outcomes.outcomes.find((o) => o.taskId === t.id)
  const frozen = data.outcomes.snapshots.find((s) => s.id === outcome?.draftSnapshotId)?.data.rules
  const indicators =
    session?.snapshot.indicators ?? data.scheduling.indicators.filter((i) => i.taskId === t.id)
  return indicators.map((link) => {
    const indicator = data.indicators.find((i) => i.id === link.indicatorId)
    if (!indicator) throw AppError.conflict("任务关联指标已不可用")
    const prior = frozen?.find((r) => r.indicatorId === indicator.id),
      rule = calculationRule(data, indicator.id, date)
    return {
      indicatorId: indicator.id,
      indicatorName: indicator.name,
      unit: prior?.unit ?? indicator.unit,
      plannedValue: link.plannedValue,
      mode: prior?.mode ?? rule?.mode ?? ("MANUAL" as const),
    }
  })
}
export class RegistrationService {
  constructor(
    readonly repository: ProjectRepository = projectRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  detail(actor: Actor, id: number, date?: string) {
    return executionRead(this.repository, actor, (data) => {
      const current = data.actor!,
        t = simpleTask(data, current, id),
        session = sessionFor(data, id)
      const outcome = data.outcomes.outcomes.find((o) => o.taskId === id)
      let canEdit = true
      try {
        owner(data, current, t)
      } catch {
        canEdit = false
      }
      const inReview =
        outcome?.summaryStatus === "IN_REVIEW" ||
        data.outcomes.links.some(
          (l) =>
            l.taskId === id &&
            (data.reports.some((r) => r.id === l.recordId && r.status === "IN_REVIEW") ||
              data.changes.some((c) => c.pendingReportId === l.recordId)),
        )
      const readPeople = current.profile.permissions.includes("service:participant:view")
      const rules = rulesFor(
        data,
        t,
        date ? businessDate(instant(date)) : businessDate(session?.startedAt ?? t.startAt),
      )
      return {
        task: {
          id: t.id,
          projectId: t.projectId,
          teamId: t.teamId,
          title: t.title,
          projectName: data.projects.find((p) => p.id === t.projectId)?.name,
          teamName: data.identity.orgs.find((o) => o.id === t.teamId)?.name,
          leaderName: data.identity.users.find((u) => u.id === t.leaderId)?.name,
          address: t.address,
          regionPathSnapshot: t.regionPathSnapshot,
          startAt: t.startAt,
          endAt: t.endAt,
        },
        taskVersion: t.version,
        sourceVersion: session?.sourceVersion ?? 0,
        outcomeVersion: outcome?.version ?? 0,
        canEdit:
          canEdit &&
          !inReview &&
          t.status !== "CANCELED" &&
          (readPeople || !rules.some((r) => r.mode === "PEOPLE")),
        inReview: !!inReview,
        canSubmit:
          !outcome ||
          (rules.length
            ? data.outcomes.links.some(
                (l) =>
                  l.taskId === id &&
                  data.reports.some(
                    (r) =>
                      r.id === l.recordId &&
                      ["DRAFT", "REJECTED"].includes(r.status) &&
                      !r.submittedAt,
                  ),
              )
            : outcome.summaryStatus !== "SUBMITTED" || outcomeTaskState(data, id).sourceChanged),
        state: outcomeTaskState(data, id).state,
        registrationState: outcomeTaskState(data, id).registrationState,
        registered: !!session?.registration,
        startAt: session?.startedAt ?? t.startAt,
        endAt: session?.endedAt ?? t.endAt,
        summary: outcome?.summary ?? "",
        rules,
        source: session?.registration
          ? sourceView(outcomeSource(data, id, outcome?.summary ?? ""), current)
          : null,
        needsCorrection:
          data.outcomes.links.some(
            (l) =>
              l.taskId === id && data.reports.some((r) => r.id === l.recordId && !!r.submittedAt),
          ) || !!outcome?.effectiveSummarySnapshotId,
        participants: readPeople
          ? data.executions.participants
              .filter((p) => p.projectId === t.projectId)
              .map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status }))
          : [],
        staff: data.scheduling.staff
          .filter((s) => s.taskId === id)
          .map((s) => ({
            userId: s.userId,
            name: data.identity.users.find((u) => u.id === s.userId)?.name ?? "原工作人员",
          })),
      }
    })
  }
  save(actor: Actor, id: number, input: RegistrationInput) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = simpleTask(data, current, id)
      owner(data, current, t)
      const hash = fingerprint(input),
        previous = data.outcomes.snapshots.find(
          (frame) =>
            frame.data.taskId === id && frame.data.registration?.requestKey === input.requestKey,
        )
      if (previous) {
        if (
          previous.data.registration!.submittedBy !== current.user.id ||
          previous.data.registration!.fingerprint !== hash
        )
          throw AppError.conflict("登记请求标识已用于其他内容")
        return {
          taskId: id,
          sourceVersion: sessionFor(data, id)?.sourceVersion ?? 0,
          replayed: true,
        }
      }
      const existing = sessionFor(data, id),
        outcome = data.outcomes.outcomes.find((o) => o.taskId === id)
      assertVersion(t.version, input.taskVersion)
      assertVersion(existing?.sourceVersion ?? 0, input.sourceVersion)
      assertVersion(outcome?.version ?? 0, input.outcomeVersion)
      if (t.status === "CANCELED" || existing?.status === "STOPPED")
        throw AppError.conflict("已取消或中止的任务不能登记正常完成")
      const links = data.outcomes.links.filter((l) => l.taskId === id)
      if (
        outcome?.summaryStatus === "IN_REVIEW" ||
        links.some(
          (l) =>
            data.reports.some((r) => r.id === l.recordId && r.status === "IN_REVIEW") ||
            data.changes.some((c) => c.pendingReportId === l.recordId),
        )
      )
        throw AppError.conflict("已有待审批记录，请先撤回再修改登记")
      if (
        (outcome?.effectiveSummarySnapshotId ||
          links.some((l) => data.reports.some((r) => r.id === l.recordId && r.submittedAt))) &&
        !input.reason?.trim()
      )
        throw AppError.badRequest("已生效的服务请填写登记更正原因")
      const start = instant(input.startAt),
        end = instant(input.endAt),
        now = this.now()
      if (end <= start || end > now)
        throw AppError.badRequest("实际结束须晚于开始且不得晚于当前时间")
      const contract = data.contracts.find((c) => c.projectId === t.projectId),
        project = data.projects.find((p) => p.id === t.projectId && !p.deletedAt)
      const firstDay = businessDate(start),
        lastDay = businessDate(new Date(end.getTime() - 1))
      if (
        !contract ||
        project?.status !== "ACTIVE" ||
        firstDay < contract.startDate ||
        lastDay > contract.endDate
      )
        throw AppError.conflict("实际服务须处于启用项目的合同期间")
      const assignedIds = data.scheduling.staff.filter((s) => s.taskId === id).map((s) => s.userId)
      const eligible = qualifiedStaff(data, t.projectId, t.teamId, firstDay, lastDay)
      if (!eligible.some((u) => u.id === current.user.id))
        throw AppError.forbidden("负责人实际服务期间的项目归属无效")
      const rules = rulesFor(data, t, firstDay)
      if (
        input.indicators.length !== rules.length ||
        new Set(input.indicators.map((r) => r.indicatorId)).size !== rules.length ||
        input.indicators.some((r) => !rules.some((rule) => rule.indicatorId === r.indicatorId))
      )
        throw AppError.badRequest("请填写本任务全部且不重复的指标成果")
      const indicators = input.indicators.map((row) => {
        const rule = rules.find((r) => r.indicatorId === row.indicatorId)!
        const value = decimalText(decimalUnits(row.value))
        if (rule.mode === "VISITS" && decimalUnits(value) % 100n)
          throw AppError.badRequest("服务人次须为非负整数")
        if (rule.mode !== "PEOPLE" && row.participantIds.length)
          throw AppError.badRequest("本指标无需服务对象名单")
        if (rule.mode === "PEOPLE") {
          requirePermission(current, "service:participant:view")
          for (const pid of row.participantIds)
            if (
              !data.executions.participants.some(
                (p) =>
                  p.id === pid &&
                  p.projectId === t.projectId &&
                  (p.status === "ACTIVE" ||
                    existing?.registration?.indicators.some(
                      (r) => r.indicatorId === row.indicatorId && r.participantIds.includes(pid),
                    )),
              )
            )
              throw AppError.forbidden("服务对象须属于本项目且可用于本次登记")
        }
        if (rule.mode !== "STAFF_HOURS" && row.intervals.length)
          throw AppError.badRequest("本指标无需工作人员时段")
        const intervals = row.intervals.map((i) => {
          const a = instant(i.startAt),
            b = instant(i.endAt)
          if (
            !assignedIds.includes(i.userId) ||
            !qualifiedStaff(
              data,
              t.projectId,
              t.teamId,
              businessDate(a),
              businessDate(new Date(b.getTime() - 1)),
            ).some((u) => u.id === i.userId)
          )
            throw AppError.forbidden("工时人员须已分派且在实际服务期间有效")
          if (a < start || b > end || b <= a)
            throw AppError.badRequest("人员实际时段须有效且处于本次服务起止内")
          return { userId: i.userId, startAt: a.toISOString(), endAt: b.toISOString() }
        })
        return {
          indicatorId: row.indicatorId,
          value: rule.mode === "SCENES" ? "1.00" : value,
          participantIds: row.participantIds,
          intervals,
        }
      })
      const registration: ExecutionRegistration = {
        schemaVersion: 1,
        requestKey: input.requestKey,
        fingerprint: hash,
        submittedBy: current.user.id,
        submittedAt: now.toISOString(),
        indicators,
      }
      const snapshot: ExecutionSnapshot = existing?.snapshot ?? {
        executionMode: "SIMPLE",
        taskVersion: t.version,
        startAt: t.startAt.toISOString(),
        endAt: t.endAt.toISOString(),
        location: t.location,
        address: t.address,
        regionCode: t.regionCode,
        regionPathSnapshot: t.regionPathSnapshot,
        policy: { ...policyFor(data, t), locationCheckEnabled: false },
        staff: assignedIds.map((userId) => {
          const u = data.identity.users.find((u) => u.id === userId)!,
            m = data.members.find(
              (m) => m.projectId === t.projectId && m.teamId === t.teamId && m.userId === userId,
            )
          return {
            userId,
            name: u.name,
            supervisorId: u.supervisorId,
            startDate: m?.startDate ?? contract.startDate,
            endDate: m?.endDate ?? contract.endDate,
            management: !m,
          }
        }),
        indicators: data.scheduling.indicators
          .filter((i) => i.taskId === id)
          .map((i) => ({
            indicatorId: i.indicatorId,
            planId: i.planId,
            periodId: i.periodId,
            plannedValue: i.plannedValue,
          })),
      }
      const values = {
        status: "ENDED" as const,
        snapshot,
        registration,
        startedAt: start,
        endedAt: end,
        startedBy: existing?.startedBy ?? current.user.id,
        endedBy: current.user.id,
        sourceVersion: (existing?.sourceVersion ?? 0) + 1,
        version: (existing?.version ?? 0) + 1,
      }
      if (existing) {
        await tx.executions.sessions.update(existing.id, values)
        Object.assign(existing, values)
      } else {
        await tx.executions.sessions.insert({ taskId: id, ...values })
        const refreshed = await tx.executions.refreshSessions()
        data.executions.sessions = refreshed
      }
      const service = new OutcomeService(this.repository)
      await service.generateWithin(tx, data, current, id)
      let refreshed = await tx.outcomes.refresh()
      data.outcomes = refreshed.outcomes
      data.reports = refreshed.reports
      const actualOutcome = data.outcomes.outcomes.find((o) => o.taskId === id)!
      await service.saveWithin(tx, data, current, id, {
        version: actualOutcome.version,
        sourceVersion: values.sourceVersion,
        summary: input.summary,
        manualValues: Object.fromEntries(
          rules
            .filter((r) => r.mode === "MANUAL")
            .map((r) => [
              String(r.indicatorId),
              indicators.find((i) => i.indicatorId === r.indicatorId)!.value,
            ]),
        ),
        evidenceIds: input.evidenceIds,
      })
      refreshed = await tx.outcomes.refresh()
      await businessAudit(
        tx,
        current.user.id,
        "save-execution-registration",
        "execution",
        id,
        null,
        {
          sourceVersion: values.sourceVersion,
          reason: input.reason ?? "",
          snapshotId: refreshed.outcomes.outcomes.find((o) => o.taskId === id)!.draftSnapshotId,
        },
      )
      return { taskId: id, sourceVersion: values.sourceVersion, replayed: false }
    })
  }
}
