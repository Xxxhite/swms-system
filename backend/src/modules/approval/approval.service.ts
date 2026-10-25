import { matchesRecordChange, isHandledApproval } from "./approval-link"
import { assertVersion, requirePermission, type Actor } from "@/utils/authorization"
import { assertBusinessAccess } from "@/utils/business-scope"
import { AppError } from "@/utils/errors"
import { businessAudit } from "@/utils/business-audit"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { sortRows } from "@/utils/list-sort"
import { pageResult, type BusinessQuery } from "@/modules/project/project.validation"
/** 服务档案审批服务：实际任务关系授予最小快照访问，不扩大整个项目的统计范围。 */
export class ApprovalService {
  constructor(readonly repository: ProjectRepository = projectRepository) {}
  /** 本人待办和已办列表；开发全局查看另行允许只读。 */
  tasks(actor: Actor, q: BusinessQuery) {
    requirePermission(actor, "service:monthly:approve")
    return this.repository.approvals(actor, (data) =>
      pageResult(
        sortRows(
          data.tasks
            .filter(
              (t) =>
                (t.approverId === actor.user.id || !!data.actor?.profile.isDevSuperadmin) &&
                data.instances.some(
                  (i) =>
                    i.id === t.instanceId &&
                    ["MONTHLY_CHANGE", "SERVICE_CHANGE", "SERVICE_SUBMISSION"].includes(
                      i.businessType,
                    ),
                ) &&
                (!q.status || t.status === q.status),
            )
            .map((t) => ({
              ...t,
              canDecide:
                t.approverId === actor.user.id &&
                !!data.instances.find((i) => i.id === t.instanceId && isHandledApproval(data, i)),
              instance: data.instances.find((i) => i.id === t.instanceId),
            })),
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
      const i = data.instances.find(
        (i) =>
          i.id === id &&
          ["MONTHLY_CHANGE", "SERVICE_CHANGE", "SERVICE_SUBMISSION"].includes(i.businessType),
      )
      if (!i) throw AppError.notFound()
      requirePermission(
        actor,
        i.applicantId === actor.user.id ? "service:monthly:view" : "service:monthly:approve",
      )
      assertBusinessAccess(
        !!data.actor?.profile.isDevSuperadmin ||
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
  /** 首次及变更决定与档案有效值、状态、版本、审计同事务提交，相同终态幂等。 */
  decide(actor: Actor, id: number, version: number, approved: boolean, comment = "") {
    return this.repository.write(actor, async (tx, data, current) => {
      requirePermission(current, "service:monthly:approve")
      const task = data.tasks.find((t) => t.id === id)
      if (!task) throw AppError.notFound()
      const instance = data.instances.find((i) => i.id === task.instanceId)!
      if (
        !["MONTHLY_CHANGE", "SERVICE_CHANGE", "SERVICE_SUBMISSION"].includes(instance.businessType)
      )
        throw AppError.notFound()
      assertBusinessAccess(
        task.approverId === current.user.id && instance.applicantId !== current.user.id,
      )
      const status = approved ? "APPROVED" : "REJECTED"
      if (task.status === status) return { id }
      if (task.status !== "PENDING" || instance.status !== "IN_REVIEW")
        throw AppError.conflict("任务已处理")
      assertVersion(task.version, version)
      if (!approved && !comment.trim()) throw AppError.badRequest("驳回须填写意见")
      const c =
        instance.businessType === "SERVICE_SUBMISSION"
          ? undefined
          : data.changes.find(
              (c) => matchesRecordChange(data, instance, c) && c.pendingReportId !== null,
            )
      const r = data.reports.find(
        (r) =>
          r.id ===
          (instance.businessType === "SERVICE_SUBMISSION" ? instance.businessId : c?.reportId),
      )
      if (!r) throw AppError.conflict("该任务属于未接入的历史项目，仅供查看")
      const p = data.projects.find(
        (p) =>
          !p.deletedAt &&
          data.indicators.some((i) => i.id === r.indicatorId && i.projectId === p.id),
      )
      if (!p) throw AppError.conflict("对应合同包项目不可用")
      if (instance.businessType === "SERVICE_SUBMISSION") {
        const snapshot = instance.businessSnapshot as { reportVersion: number }
        assertVersion(r.version, snapshot.reportVersion)
        if (r.status !== "IN_REVIEW") throw AppError.conflict("服务档案已不在本次审批中")
        await tx.monthlyReports.update(r.id, {
          status: approved ? "SUBMITTED" : "REJECTED",
          ...(approved ? { submittedAt: new Date(), submittedBy: instance.applicantId } : {}),
          version: r.version + 1,
        })
      } else {
        if (!c) throw AppError.conflict("申请已失效")
        assertVersion(r.version, c.reportVersion)
        if (approved)
          await tx.monthlyReports.update(r.id, {
            actualValue: c.proposedValue,
            note: c.proposedNote,
            status: c.operation === "DELETE" ? "VOID" : "SUBMITTED",
            version: r.version + 1,
          })
        await tx.monthlyReportChanges.update(c.id, {
          pendingReportId: null,
          version: c.version + 1,
        })
      }
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
        approved ? "approve-service-record" : "reject-service-record",
        "service_record",
        r.id,
        r,
        {
          operation: c?.operation ?? "SUBMIT",
          actualValue: c?.proposedValue ?? r.actualValue,
          comment,
        },
      )
      return { id }
    })
  }
}
