import { matchesRecordChange } from "@/modules/approval/approval-link"
import { actorFrom } from "@/modules/identity/identity.service"
import { assertVersion, requirePermission, type Actor } from "@/utils/authorization"
import { assertBusinessAccess } from "@/utils/business-scope"
import { businessAudit } from "@/utils/business-audit"
import { decimalUnits, decimalText } from "@/utils/decimal"
import { AppError } from "@/utils/errors"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { assertCurrentMembership, maintainReport } from "./service.service"
import type { MonthlyChangeInput } from "./service.validation"
/** 服务档案变更审批：旧值保持有效直到指定主管批准，完整变更同事务提交。 */
export class MonthlyChangeService {
  constructor(readonly repository: ProjectRepository = projectRepository) {}
  /** 创建变更申请，冻结服务档案版本、拟值、直接主管和节点快照。 */
  create(actor: Actor, id: number, input: MonthlyChangeInput) {
    return this.repository.write(actor, async (tx, data, current) => {
      const r = data.reports.find((r) => r.id === id)
      if (!r) throw AppError.notFound()
      const { project } = maintainReport(
        data,
        current,
        r.indicatorId,
        r.teamId,
        input.operation === "DELETE" ? "service:monthly:delete" : "service:monthly:update",
      )
      assertCurrentMembership(data, current, project, r.teamId, "当前成员归属已过期，不能申请变更")
      assertVersion(r.version, input.version)
      if (!input.reason.trim()) throw AppError.badRequest("请填写变更原因")
      if (
        !r.submittedAt ||
        (input.operation === "RESTORE" ? r.status !== "VOID" : r.status !== "SUBMITTED")
      )
        throw AppError.conflict("当前状态不能申请此项变更")
      if (data.changes.some((c) => c.pendingReportId === id))
        throw AppError.conflict("该服务档案已有待处理申请")
      const supervisor = data.identity.users.find(
        (u) => u.id === current.user.supervisorId && u.status === "ACTIVE",
      )
      if (!supervisor || supervisor.id === current.user.id)
        throw AppError.conflict("请先配置启用的直接主管，且不得自审")
      requirePermission(actorFrom(data.identity, supervisor), "service:monthly:approve")
      const value =
        input.operation === "CORRECT"
          ? decimalText(decimalUnits(input.actualValue ?? "invalid"))
          : r.actualValue
      const [change] = await tx.monthlyReportChanges.insert({
        reportId: id,
        operation: input.operation,
        reportVersion: r.version,
        beforeValue: r.actualValue,
        beforeStatus: r.status,
        proposedValue: value,
        proposedNote: input.note ?? r.note,
        reason: input.reason,
        applicantId: current.user.id,
        pendingReportId: id,
      })
      const indicator = data.indicators.find((i) => i.id === r.indicatorId)!
      const [instance] = await tx.approvalInstances.insert({
        businessType: "SERVICE_CHANGE",
        businessId: change.insertId,
        applicantId: current.user.id,
        workflowSnapshot: {
          schemaVersion: 1,
          nodes: [{ nodeNo: 1, name: "直接主管确认", approverIds: [supervisor.id] }],
        },
        businessSnapshot: {
          projectName: data.projects.find((p) => p.id === indicator.projectId)?.name,
          indicatorName: indicator.name,
          teamName: data.identity.orgs.find((o) => o.id === r.teamId)?.name,
          reportId: id,
          projectId: indicator.projectId,
          indicatorId: r.indicatorId,
          teamId: r.teamId,
          month: r.month,
          serviceDate: r.serviceDate,
          operation: input.operation,
          beforeValue: r.actualValue,
          proposedValue: value,
          reportVersion: r.version,
          reason: input.reason,
        },
      })
      await tx.approvalTasks.insert({ instanceId: instance.insertId, approverId: supervisor.id })
      await tx.approvalRecords.insert({
        instanceId: instance.insertId,
        actorId: current.user.id,
        action: "SUBMIT",
        comment: input.reason,
      })
      await businessAudit(
        tx,
        current.user.id,
        "request-service-change",
        "service_record_change",
        change.insertId,
        null,
        input,
      )
      return { id: change.insertId, instanceId: instance.insertId }
    })
  }
  /** 申请人撤回待决申请，原值不变，主管改变后可重新发起新实例。 */
  withdraw(actor: Actor, id: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      const c = data.changes.find((c) => c.id === id),
        instance = data.instances.find((i) => !!c && matchesRecordChange(data, i, c))
      if (!c || !instance) throw AppError.notFound()
      requirePermission(
        current,
        c.operation === "DELETE" ? "service:monthly:delete" : "service:monthly:update",
      )
      assertBusinessAccess(c.applicantId === current.user.id)
      if (instance.status === "CANCELLED") return { id }
      if (instance.status !== "IN_REVIEW") throw AppError.conflict("申请已处理")
      await tx.monthlyReportChanges.update(id, { pendingReportId: null, version: c.version + 1 })
      await tx.approvalInstances.update(instance.id, {
        status: "CANCELLED",
        completedAt: new Date(),
        version: instance.version + 1,
      })
      for (const t of data.tasks.filter(
        (t) => t.instanceId === instance.id && t.status === "PENDING",
      ))
        await tx.approvalTasks.update(t.id, {
          status: "CANCELLED",
          decidedAt: new Date(),
          version: t.version + 1,
        })
      await tx.approvalRecords.insert({
        instanceId: instance.id,
        actorId: current.user.id,
        action: "WITHDRAW",
      })
      await businessAudit(
        tx,
        current.user.id,
        "withdraw-service-change",
        "service_record_change",
        id,
        c,
        {
          status: "CANCELLED",
        },
      )
      return { id }
    })
  }
}
