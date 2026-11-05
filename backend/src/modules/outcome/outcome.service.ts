import type { Actor } from "@/utils/authorization"
import { assertVersion, requirePermission } from "@/utils/authorization"
import { canMaintainProject } from "@/utils/business-scope"
import { actorFrom } from "@/modules/identity/identity.service"
import {
  projectRepository,
  type ProjectRepository,
  type BusinessState,
  type BusinessConnection,
} from "@/modules/project/project.repository"
import { maintainReport } from "@/modules/service/service.service"
import { businessToday } from "@/modules/service/indicator-calculation"
import { fingerprint, dateValid } from "@/modules/task/task-calendar"
import { AppError } from "@/utils/errors"
import { businessAudit } from "@/utils/business-audit"
import { calculateOutcome } from "./outcome.calculation"
import { outcomeSource } from "./outcome.source"
import { outcomeAccess, outcomeFresh, outcomeVersion } from "./outcome.authorization"
import type { OutcomeInput, OutcomeSubmitInput, RuleInput } from "./outcome.validation"
import type { OutcomeSource } from "@/db/schema/outcome"

export function sourceView(source: OutcomeSource, actor: Actor) {
  return {
    ...source,
    ...(source.registration && !actor.profile.permissions.includes("service:participant:view")
      ? {
          registration: {
            ...source.registration,
            indicators: source.registration.indicators.map((r) => ({ ...r, participantIds: [] })),
          },
        }
      : {}),
    participants: actor.profile.permissions.includes("service:participant:view")
      ? source.participants
      : [],
  }
}
export function directReviewer(data: BusinessState, actor: Actor) {
  const supervisor = data.identity.users.find(
    (u) => u.id === actor.user.supervisorId && u.status === "ACTIVE",
  )
  if (!supervisor || supervisor.id === actor.user.id)
    throw AppError.conflict("请配置启用的直接主管，且不得自审")
  requirePermission(actorFrom(data.identity, supervisor), "service:monthly:approve")
  return supervisor.id
}
async function freeze(
  tx: BusinessConnection,
  actor: Actor,
  outcomeId: number,
  source: OutcomeSource,
) {
  const id = await tx.outcomes.snapshots.insert({
    outcomeId,
    sourceVersion: source.sourceVersion,
    fingerprint: fingerprint(source),
    data: source,
    createdBy: actor.user.id,
  })
  return id
}
export class OutcomeService {
  constructor(readonly repository: ProjectRepository = projectRepository) {}
  rule(actor: Actor, indicatorId: number) {
    requirePermission(actor, "service:indicator:view")
    return this.repository.read(actor, (data) => {
      if (!data.indicators.some((i) => i.id === indicatorId && !i.deletedAt))
        throw AppError.notFound()
      return data.outcomes.rules
        .filter((r) => r.indicatorId === indicatorId)
        .sort((a, b) => b.revision - a.revision)
    })
  }
  saveRule(actor: Actor, indicatorId: number, input: RuleInput) {
    return this.repository.write(actor, async (tx, data, current) => {
      requirePermission(current, "service:indicator:manage")
      const indicator = data.indicators.find((i) => i.id === indicatorId && !i.deletedAt),
        project = data.projects.find((p) => p.id === indicator?.projectId && !p.deletedAt),
        contract = data.contracts.find((c) => c.projectId === project?.id)
      if (!indicator || !project || !contract || !canMaintainProject(current, project))
        throw AppError.notFound()
      const prior = data.outcomes.rules
        .filter((r) => r.indicatorId === indicatorId)
        .sort((a, b) => b.revision - a.revision)[0]
      assertVersion(prior?.revision ?? 0, input.revision)
      if (
        !dateValid(input.effectiveDate) ||
        input.effectiveDate < businessToday() ||
        input.effectiveDate < contract.startDate ||
        input.effectiveDate > contract.endDate ||
        (prior && input.effectiveDate < prior.effectiveDate)
      )
        throw AppError.badRequest("启用日期须不早于今天及原规则，并处于合同期间")
      const units: Record<string, string[]> = {
        PEOPLE: ["人"],
        VISITS: ["人次"],
        STAFF_HOURS: ["小时", "工时"],
        SCENES: ["场", "次"],
      }
      if (input.mode !== "MANUAL" && !units[input.mode]!.includes(indicator.unit))
        throw AppError.badRequest("该计算口径与指标单位不匹配")
      const reports = data.reports.filter(
        (r) => r.indicatorId === indicatorId && r.status !== "VOID",
      )
      const hasOld = reports.some((r) => {
        const link = data.outcomes.links.find((l) => l.recordId === r.id),
          review = data.outcomes.reviews.find((v) => v.id === link?.effectiveReviewId),
          frame = data.outcomes.snapshots.find((f) => f.id === link?.draftSnapshotId)
        return (
          !link ||
          (review?.measure.mode ??
            frame?.data.rules.find((rule) => rule.indicatorId === indicatorId)?.mode) !== input.mode
        )
      })
      if (["PEOPLE", "STAFF_HOURS"].includes(input.mode) && hasOld)
        throw AppError.conflict("该指标含无身份或时间明细的历史档案，请保留人工口径或建立新指标")
      if (
        data.outcomes.links.some(
          (l) =>
            l.indicatorId === indicatorId &&
            data.outcomes.snapshots
              .find((f) => f.id === l.draftSnapshotId)
              ?.data.rules.find((r) => r.indicatorId === indicatorId)?.mode !== input.mode,
        )
      )
        throw AppError.conflict("已有来源档案的计算口径不能更换，请使用新指标")
      if (
        input.mode !== "MANUAL" &&
        reports.some(
          (r) =>
            !data.outcomes.links.some((l) => l.recordId === r.id) &&
            (!r.serviceDate || r.serviceDate >= input.effectiveDate),
        )
      )
        throw AppError.conflict("启用日及以后仍有人工来源档案，请先处理衔接日期")
      const id = await tx.outcomes.rules.insert({
        indicatorId,
        mode: input.mode,
        effectiveDate: input.effectiveDate,
        revision: input.revision + 1,
        reason: input.reason,
        createdBy: current.user.id,
      })
      await businessAudit(
        tx,
        current.user.id,
        "configure-indicator-calculation",
        "project_indicator",
        indicatorId,
        prior ?? null,
        input,
      )
      return { id, revision: input.revision + 1 }
    })
  }
  detail(actor: Actor, taskId: number) {
    return this.repository.read(actor, (data) => {
      outcomeAccess(data, data.actor!, taskId)
      let canMaintain = false
      try {
        outcomeAccess(data, data.actor!, taskId, "service:monthly:update", true)
        canMaintain = true
      } catch (error) {
        if (!(error instanceof AppError)) throw error
      }
      const outcome = data.outcomes.outcomes.find((o) => o.taskId === taskId),
        session = data.executions.sessions.find((s) => s.taskId === taskId)
      if (!outcome)
        return {
          outcome: null,
          canMaintain,
          sourceVersion: session?.sourceVersion ?? 0,
          records: [],
          snapshots: [],
        }
      const snapshot = data.outcomes.snapshots.find((s) => s.id === outcome.draftSnapshotId)
      return {
        outcome,
        canMaintain,
        sourceVersion: session?.sourceVersion ?? 0,
        source: snapshot ? sourceView(snapshot.data, data.actor!) : null,
        records: data.outcomes.links
          .filter((l) => l.outcomeId === outcome.id)
          .map((l) => ({
            ...l,
            record: data.reports.find((r) => r.id === l.recordId),
            pendingChange:
              data.changes
                .filter((c) => c.pendingReportId === l.recordId)
                .map((c) => ({ id: c.id, applicantId: c.applicantId }))[0] ?? null,
            effectiveReview:
              data.outcomes.reviews
                .filter((r) => r.id === l.effectiveReviewId)
                .map((r) => ({
                  id: r.id,
                  value: r.measure.value,
                  mode: r.measure.mode,
                  snapshotId: r.snapshotId,
                }))[0] ?? null,
          })),
        snapshots: data.outcomes.snapshots
          .filter((s) => s.outcomeId === outcome.id)
          .map((s) => ({ id: s.id, sourceVersion: s.sourceVersion, createdAt: s.createdAt })),
        summarySubmissions: data.instances
          .filter((i) => i.businessType === "TASK_SUMMARY" && i.businessId === outcome.id)
          .map((i) => ({ id: i.id, status: i.status, applicantId: i.applicantId })),
        sourceStale: !!snapshot && snapshot.sourceVersion !== session?.sourceVersion,
      }
    })
  }
  generate(actor: Actor, taskId: number) {
    return this.repository.write(actor, (tx, data, current) => {
      if (data.scheduling.tasks.find((t) => t.id === taskId)?.executionMode === "SIMPLE")
        throw AppError.conflict("本任务请使用执行登记")
      return this.generateWithin(tx, data, current, taskId)
    })
  }
  async generateWithin(
    tx: BusinessConnection,
    data: BusinessState,
    current: Actor,
    taskId: number,
  ) {
    outcomeAccess(data, current, taskId, "service:monthly:create", true)
    const existing = data.outcomes.outcomes.find((o) => o.taskId === taskId)
    if (existing) return { id: existing.id, replayed: true }
    const source = outcomeSource(data, taskId, "")
    const id = await tx.outcomes.outcomes.insert({ taskId, createdBy: current.user.id }),
      snapshotId = await freeze(tx, current, id, source)
    for (const rule of source.rules) {
      if (source.state === "STOPPED" && rule.mode !== "MANUAL") continue
      maintainReport(
        data,
        current,
        rule.indicatorId,
        source.teamId,
        "service:monthly:create",
        source.date,
      )
      const value = calculateOutcome(
        source,
        rule.mode,
        [],
        rule.manualValue,
        false,
        rule.indicatorId,
      ).value
      const [record] = await tx.monthlyReports.insert({
        indicatorId: rule.indicatorId,
        teamId: source.teamId,
        serviceDate: source.date,
        month: source.date.slice(0, 7),
        actualValue: value,
        createdBy: current.user.id,
        requestKey: `outcome:${taskId}:${rule.indicatorId}`,
      })
      await tx.outcomes.links.insert({
        outcomeId: id,
        taskId,
        indicatorId: rule.indicatorId,
        recordId: record.insertId,
        draftSnapshotId: snapshotId,
      })
    }
    await tx.outcomes.outcomes.update(id, { draftSnapshotId: snapshotId })
    await businessAudit(tx, current.user.id, "generate-task-outcome", "execution", taskId, null, {
      outcomeId: id,
      snapshotId,
    })
    return { id, replayed: false }
  }
  save(actor: Actor, taskId: number, input: OutcomeInput) {
    return this.repository.write(actor, (tx, data, current) => {
      if (data.scheduling.tasks.find((t) => t.id === taskId)?.executionMode === "SIMPLE")
        throw AppError.conflict("本任务请使用执行登记")
      return this.saveWithin(tx, data, current, taskId, input)
    })
  }
  async saveWithin(
    tx: BusinessConnection,
    data: BusinessState,
    current: Actor,
    taskId: number,
    input: OutcomeInput,
  ) {
    outcomeAccess(data, current, taskId, "service:monthly:update", true)
    const outcome = data.outcomes.outcomes.find((o) => o.taskId === taskId)
    if (!outcome) throw AppError.conflict("请先生成来源草稿")
    outcomeVersion(outcome.version, input.version)
    const source = outcomeSource(data, taskId, input.summary, input.manualValues)
    assertVersion(source.sourceVersion, input.sourceVersion)
    if (
      Object.keys(input.manualValues).some(
        (id) => !source.rules.some((r) => String(r.indicatorId) === id && r.mode === "MANUAL"),
      )
    )
      throw AppError.badRequest("人工成果指标不属于本次任务或不是人工口径")
    for (const id of [...new Set(input.evidenceIds)]) {
      const file = data.executions.evidence.find(
        (f) =>
          f.id === id &&
          f.taskId === taskId &&
          !f.deletedAt &&
          ((f.boundKind === "OUTCOME" && f.boundId === outcome.id) ||
            (!f.boundKind && f.uploadedBy === current.user.id)),
      )
      if (!file) throw AppError.forbidden("整理凭证不存在或不属于本人及本次任务")
      if (!file.boundKind) {
        await tx.executions.evidence.update(id, {
          boundKind: "OUTCOME",
          boundId: outcome.id,
          version: file.version + 1,
        })
        file.boundKind = "OUTCOME"
        file.boundId = outcome.id
      }
    }
    const actual = outcomeSource(data, taskId, input.summary, input.manualValues),
      snapshotId = await freeze(tx, current, outcome.id, actual)
    for (const link of data.outcomes.links.filter((l) => l.outcomeId === outcome.id)) {
      const record = data.reports.find((r) => r.id === link.recordId)!,
        rule = actual.rules.find((r) => r.indicatorId === link.indicatorId)!
      if (record.status === "IN_REVIEW") continue
      await tx.outcomes.links.update(link.id, {
        draftSnapshotId: snapshotId,
        version: link.version + 1,
      })
      if (["DRAFT", "REJECTED"].includes(record.status) && !record.submittedAt)
        await tx.monthlyReports.update(record.id, {
          actualValue: calculateOutcome(
            actual,
            rule.mode,
            [],
            rule.manualValue,
            false,
            rule.indicatorId,
          ).value,
          note: input.summary.slice(0, 1000),
          ...(actual.registration
            ? { serviceDate: actual.date, month: actual.date.slice(0, 7) }
            : {}),
          status: "DRAFT",
          version: record.version + 1,
        })
    }
    await tx.outcomes.outcomes.update(outcome.id, {
      summary: input.summary,
      draftSnapshotId: snapshotId,
      version: outcome.version + 1,
    })
    await businessAudit(tx, current.user.id, "save-task-outcome", "execution", taskId, null, {
      snapshotId,
      sourceVersion: source.sourceVersion,
    })
    return { id: outcome.id, snapshotId }
  }
  submit(actor: Actor, taskId: number, input: OutcomeSubmitInput) {
    return this.repository.write(actor, async (tx, data, current) => {
      const task = outcomeAccess(data, current, taskId, "service:monthly:submit", true),
        outcome = data.outcomes.outcomes.find((o) => o.taskId === taskId)
      if (!outcome) throw AppError.notFound()
      const payloadFingerprint = fingerprint(input),
        prior = data.instances.filter(
          (i) =>
            i.applicantId === current.user.id &&
            (i.businessSnapshot as Record<string, unknown>).outcomeId === outcome.id &&
            (i.businessSnapshot as Record<string, unknown>).requestKey === input.requestKey,
        )
      if (prior.length) {
        if (
          prior.some(
            (i) =>
              (i.businessSnapshot as Record<string, unknown>).requestFingerprint !==
              payloadFingerprint,
          )
        )
          throw AppError.conflict("提交请求标识对应的内容已变化")
        return { instanceIds: prior.map((i) => i.id), replayed: true }
      }
      outcomeVersion(outcome.version, input.version)
      const snapshot = data.outcomes.snapshots.find((s) => s.id === outcome.draftSnapshotId)
      if (!snapshot || !snapshot.data.summary.trim())
        throw AppError.badRequest("请保存服务总结后提交")
      outcomeFresh(data, snapshot)
      assertVersion(snapshot.sourceVersion, input.sourceVersion)
      const approverId = directReviewer(data, current),
        project = data.projects.find((p) => p.id === task.projectId)!,
        instanceIds: number[] = []
      const common = {
        outcomeId: outcome.id,
        taskId,
        projectId: task.projectId,
        projectName: project.name,
        teamId: task.teamId,
        teamName: data.identity.orgs.find((o) => o.id === task.teamId)?.name,
        serviceDate: snapshot.data.date,
        month: snapshot.data.date.slice(0, 7),
        operation: "SUBMIT",
        requestKey: input.requestKey,
        requestFingerprint: payloadFingerprint,
      }
      if (!snapshot.data.rules.length) {
        if (snapshot.data.state !== "ENDED" || outcome.summaryStatus === "IN_REVIEW")
          throw AppError.conflict("当前状态不能提交总结确认")
        const [instance] = await tx.approvalInstances.insert({
          businessType: "TASK_SUMMARY",
          businessId: outcome.id,
          round:
            data.instances.filter(
              (i) => i.businessType === "TASK_SUMMARY" && i.businessId === outcome.id,
            ).length + 1,
          applicantId: current.user.id,
          workflowSnapshot: {
            schemaVersion: 1,
            nodes: [{ nodeNo: 1, name: "直接主管确认", approverIds: [approverId] }],
          },
          businessSnapshot: {
            ...common,
            indicatorName: "指标外服务总结",
            outcomeSnapshotId: snapshot.id,
            beforeValue: "0.00",
            proposedValue: "0.00",
          },
        })
        await tx.approvalTasks.insert({ instanceId: instance.insertId, approverId })
        await tx.approvalRecords.insert({
          instanceId: instance.insertId,
          actorId: current.user.id,
          action: "SUBMIT",
        })
        instanceIds.push(instance.insertId)
        await tx.outcomes.outcomes.update(outcome.id, {
          summaryStatus: "IN_REVIEW",
          version: outcome.version + 1,
        })
      } else {
        if (!input.recordIds.length || new Set(input.recordIds).size !== input.recordIds.length)
          throw AppError.badRequest("请选择不重复的成果草稿")
        for (const id of input.recordIds) {
          const link = data.outcomes.links.find(
              (l) => l.recordId === id && l.outcomeId === outcome.id,
            ),
            record = data.reports.find((r) => r.id === id),
            frame = data.outcomes.snapshots.find((s) => s.id === link?.draftSnapshotId)
          if (
            !link ||
            !record ||
            !frame ||
            !["DRAFT", "REJECTED"].includes(record.status) ||
            record.submittedAt
          )
            throw AppError.conflict("仅可提交本任务未生效的成果草稿")
          const { indicator, contract } = maintainReport(
            data,
            current,
            record.indicatorId,
            record.teamId,
            "service:monthly:submit",
            record.serviceDate!,
          )
          if (
            !contract ||
            project.status !== "ACTIVE" ||
            indicator.status !== "ACTIVE" ||
            frame.data.date < contract.startDate ||
            frame.data.date > contract.endDate ||
            frame.data.date > businessToday()
          )
            throw AppError.conflict("项目、指标或实际服务日期不适用")
          outcomeFresh(data, frame)
          const rule = frame.data.rules.find((r) => r.indicatorId === record.indicatorId)!
          if (rule.mode === "MANUAL" && !frame.data.evidence.length)
            throw AppError.badRequest("人工专业成果请附受控凭证")
          const [instance] = await tx.approvalInstances.insert({
            businessType: "SERVICE_SUBMISSION",
            businessId: id,
            round:
              data.instances.filter(
                (i) => i.businessType === "SERVICE_SUBMISSION" && i.businessId === id,
              ).length + 1,
            applicantId: current.user.id,
            workflowSnapshot: {
              schemaVersion: 1,
              nodes: [{ nodeNo: 1, name: "直接主管确认", approverIds: [approverId] }],
            },
            businessSnapshot: {
              ...common,
              outcomeSnapshotId: frame.id,
              outcomeRecordLinkId: link.id,
              indicatorId: indicator.id,
              indicatorName: indicator.name,
              reportId: id,
              reportVersion: record.version + 1,
              beforeValue: "0.00",
              proposedValue: record.actualValue,
              note: frame.data.summary,
            },
          })
          await tx.approvalTasks.insert({ instanceId: instance.insertId, approverId })
          await tx.approvalRecords.insert({
            instanceId: instance.insertId,
            actorId: current.user.id,
            action: "SUBMIT",
          })
          await tx.monthlyReports.update(id, { status: "IN_REVIEW", version: record.version + 1 })
          instanceIds.push(instance.insertId)
        }
      }
      await businessAudit(tx, current.user.id, "submit-task-outcome", "execution", taskId, null, {
        instanceIds,
      })
      return { instanceIds, replayed: false }
    })
  }
  preview(actor: Actor, taskId: number) {
    return this.repository.read(actor, (data) => {
      outcomeAccess(data, data.actor!, taskId)
      const outcome = data.outcomes.outcomes.find((o) => o.taskId === taskId),
        source = outcomeSource(data, taskId, outcome?.summary ?? "")
      return {
        source: sourceView(source, data.actor!),
        values: source.rules
          .map((rule) => ({
            indicatorId: rule.indicatorId,
            ...calculateOutcome(source, rule.mode, [], rule.manualValue, false, rule.indicatorId),
          }))
          .map((v) => ({ indicatorId: v.indicatorId, mode: v.mode, value: v.value })),
      }
    })
  }
  withdrawSummary(actor: Actor, taskId: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      outcomeAccess(data, current, taskId, "service:monthly:submit", true)
      const outcome = data.outcomes.outcomes.find((o) => o.taskId === taskId),
        instance = data.instances.find(
          (i) =>
            i.businessType === "TASK_SUMMARY" &&
            i.businessId === outcome?.id &&
            i.status === "IN_REVIEW" &&
            i.applicantId === current.user.id,
        )
      if (!outcome || !instance) throw AppError.conflict("没有本人可撤回的总结申请")
      await tx.outcomes.outcomes.update(outcome.id, {
        summaryStatus: outcome.effectiveSummarySnapshotId ? "SUBMITTED" : "DRAFT",
        version: outcome.version + 1,
      })
      await tx.approvalInstances.update(instance.id, {
        status: "CANCELLED",
        completedAt: new Date(),
        version: instance.version + 1,
      })
      for (const task of data.tasks.filter(
        (t) => t.instanceId === instance.id && t.status === "PENDING",
      ))
        await tx.approvalTasks.update(task.id, { status: "CANCELLED", version: task.version + 1 })
      await tx.approvalRecords.insert({
        instanceId: instance.id,
        actorId: current.user.id,
        action: "WITHDRAW",
      })
      await businessAudit(tx, current.user.id, "withdraw-task-summary", "execution", taskId, null, {
        instanceId: instance.id,
      })
      return { id: outcome.id }
    })
  }
  snapshot(actor: Actor, id: number) {
    return this.repository.approvals(actor, (data) => {
      requirePermission(data.actor!, "service:monthly:view")
      const frame = data.outcomes.snapshots.find((s) => s.id === id)
      if (!frame) throw AppError.notFound()
      let allowed = false
      try {
        outcomeAccess(data, data.actor!, frame.data.taskId)
        allowed = true
      } catch {
        /* 审批快照另按实际任务授权 */
      }
      allowed ||= data.instances.some(
        (i) =>
          (i.businessSnapshot as Record<string, unknown>).outcomeSnapshotId === id &&
          (i.applicantId === actor.user.id ||
            data.tasks.some((t) => t.instanceId === i.id && t.approverId === actor.user.id)),
      )
      if (!allowed) throw AppError.notFound()
      return {
        id: frame.id,
        sourceVersion: frame.sourceVersion,
        fingerprint: frame.fingerprint,
        source: sourceView(frame.data, data.actor!),
      }
    })
  }
}
