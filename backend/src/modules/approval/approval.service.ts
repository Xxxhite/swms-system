import { assertVersion, requirePermission, type Actor } from "@/utils/authorization"
import { assertBusinessAccess } from "@/utils/business-scope"
import { AppError } from "@/utils/errors"
import { businessAudit } from "@/utils/business-audit"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { sortRows } from "@/utils/list-sort"
import { pageResult, type BusinessQuery } from "@/modules/project/project.validation"
/** 月报审批服务：实际任务关系授予最小快照访问，不扩大整个项目的统计范围。 */
export class ApprovalService {
  constructor(readonly repository: ProjectRepository = projectRepository) {}
  /** 本人待办和已办列表，仅返回实际分配给当前人的任务。 */
  tasks(actor: Actor, q: BusinessQuery) {
    requirePermission(actor, "service:monthly:approve")
    return this.repository.approvals(actor, (data) =>
      pageResult(
        sortRows(
          data.tasks
            .filter(
              (t) =>
                t.approverId === actor.user.id &&
                data.instances.some(
                  (i) => i.id === t.instanceId && i.businessType === "MONTHLY_CHANGE",
                ) &&
                (!q.status || t.status === q.status),
            )
            .map((t) => ({ ...t, instance: data.instances.find((i) => i.id === t.instanceId) })),
          q,
          {
            id: (r) => r.id,
            createdAt: (r) => r.createdAt,
            projectName: (r) =>
              String(
                (r.instance?.businessSnapshot as Record<string, unknown> | undefined)
                  ?.projectName ?? "",
              ),
            indicatorName: (r) =>
              String(
                (r.instance?.businessSnapshot as Record<string, unknown> | undefined)
                  ?.indicatorName ?? "",
              ),
            month: (r) =>
              String(
                (r.instance?.businessSnapshot as Record<string, unknown> | undefined)?.month ?? "",
              ),
          },
          [
            ["createdAt", "desc"],
            ["id", "desc"],
          ],
        ),
        q,
      ),
    )
  }
  /** 发起人或实际审批人读取当次快照及意见历史，不能通过任务关系浏览其他业务。 */
  detail(actor: Actor, id: number) {
    return this.repository.approvals(actor, (data) => {
      const i = data.instances.find((i) => i.id === id && i.businessType === "MONTHLY_CHANGE")
      if (!i) throw AppError.notFound()
      requirePermission(
        actor,
        i.applicantId === actor.user.id ? "service:monthly:view" : "service:monthly:approve",
      )
      assertBusinessAccess(
        i.applicantId === actor.user.id ||
          data.tasks.some((t) => t.instanceId === id && t.approverId === actor.user.id),
      )
      return {
        ...i,
        tasks: data.tasks.filter((t) => t.instanceId === id),
        records: data.records
          .filter((r) => r.instanceId === id)
          .map((r) => ({
            ...r,
            actorName: data.identity.users.find((u) => u.id === r.actorId)?.name ?? "未知人员",
          })),
      }
    })
  }
  /** 审批决定与月报值替换、状态、版本及审计在同一事务提交；相同终态幂等。 */
  decide(actor: Actor, id: number, version: number, approved: boolean, comment = "") {
    return this.repository.write(actor, async (tx, data, current) => {
      requirePermission(current, "service:monthly:approve")
      const task = data.tasks.find((t) => t.id === id)
      if (!task) throw AppError.notFound()
      const instance = data.instances.find((i) => i.id === task.instanceId)!
      if (instance.businessType !== "MONTHLY_CHANGE") throw AppError.notFound()
      assertBusinessAccess(
        task.approverId === current.user.id && instance.applicantId !== current.user.id,
      )
      const status = approved ? "APPROVED" : "REJECTED"
      if (task.status === status) return { id }
      if (task.status !== "PENDING" || instance.status !== "IN_REVIEW")
        throw AppError.conflict("任务已处理")
      assertVersion(task.version, version)
      if (!approved && !comment.trim()) throw AppError.badRequest("驳回须填写意见")
      const c = data.changes.find((c) => c.id === instance.businessId && c.pendingReportId !== null)
      if (!c) throw AppError.conflict("申请已失效")
      const r = data.reports.find((r) => r.id === c.reportId)
      if (!r) throw AppError.notFound()
      assertVersion(r.version, c.reportVersion)
      if (approved)
        await tx.monthlyReports.update(r.id, {
          actualValue: c.proposedValue,
          note: c.proposedNote,
          status: c.operation === "DELETE" ? "VOID" : "SUBMITTED",
          version: r.version + 1,
        })
      await tx.monthlyReportChanges.update(c.id, { pendingReportId: null, version: c.version + 1 })
      await tx.approvalTasks.update(id, {
        status,
        decidedAt: new Date(),
        version: task.version + 1,
      })
      await tx.approvalInstances.update(instance.id, {
        status,
        completedAt: new Date(),
        version: instance.version + 1,
      })
      await tx.approvalRecords.insert({
        instanceId: instance.id,
        taskId: id,
        actorId: current.user.id,
        action: approved ? "APPROVE" : "REJECT",
        comment,
      })
      await businessAudit(
        tx,
        current.user.id,
        approved ? "approve-monthly-change" : "reject-monthly-change",
        "monthly_report",
        r.id,
        r,
        { operation: c.operation, actualValue: c.proposedValue, comment },
      )
      return { id }
    })
  }
}
