import * as s from "@/db/schema"
import { requirePermission, assertVersion, type Actor } from "@/utils/authorization"
import { canReadTeam, assertBusinessAccess } from "@/utils/business-scope"
import { AppError } from "@/utils/errors"
import { decimalUnits } from "@/utils/decimal"
import { businessAudit } from "@/utils/business-audit"
import {
  projectRepository,
  type ProjectRepository,
  type BusinessState,
} from "@/modules/project/project.repository"
import { findProject, visibleTeams, fullProject } from "@/modules/project/project.service"
import { pageResult, type BusinessQuery } from "@/modules/project/project.validation"
import {
  assertReportMonth,
  businessToday,
  sumValues,
  indicatorWarning,
} from "./indicator-calculation"
import type { MonthlyInput } from "./service.validation"
export type Monthly = typeof s.monthlyReports.$inferSelect
/** 月报可见范围：SELF 仅本人创建或当前负责记录，其他范围以完整团队为界。 */
export function canReadReport(data: BusinessState, actor: Actor, r: Monthly) {
  return (
    canReadTeam(actor, r.teamId) ||
    (actor.profile.dataScope === "SELF" &&
      (r.createdBy === actor.user.id ||
        data.teams.some(
          (t) =>
            t.teamId === r.teamId &&
            t.reporterId === actor.user.id &&
            data.indicators.some((i) => i.id === r.indicatorId && i.projectId === t.projectId),
        )))
  )
}
/** 月报维护必须具备动作及当前填报责任，管理员仍须完整团队范围。 */
export function maintainReport(
  data: BusinessState,
  actor: Actor,
  indicatorId: number,
  teamId: number,
  permission: string,
) {
  requirePermission(actor, permission)
  const indicator = data.indicators.find((i) => i.id === indicatorId && !i.deletedAt)
  if (!indicator) throw AppError.notFound()
  const project = findProject(data, indicator.projectId),
    team = data.teams.find((t) => t.projectId === project.id && t.teamId === teamId)
  assertBusinessAccess(
    !!team &&
      (team.reporterId === actor.user.id || actor.profile.roles.includes("admin")) &&
      (canReadTeam(actor, teamId) ||
        (actor.profile.dataScope === "SELF" && team.reporterId === actor.user.id)),
  )
  if (
    !data.identity.orgs.some((o) => o.id === teamId && o.type === "TEAM" && o.status === "ACTIVE")
  )
    throw AppError.conflict("承担团队已停用")
  if (!data.targets.some((t) => t.indicatorId === indicatorId && t.teamId === teamId))
    throw AppError.conflict("未分配该指标的团队目标")
  return { project, indicator, contract: data.contracts.find((c) => c.projectId === project.id) }
}
/** 输出月报及本记录审批历史，不夹带项目其他团队数据。 */
export function reportDto(data: BusinessState, r: Monthly, actor: Actor) {
  const indicator = data.indicators.find((i) => i.id === r.indicatorId),
    project = data.projects.find((p) => p.id === indicator?.projectId)
  return {
    ...r,
    canMaintain:
      (actor.profile.roles.includes("admin") ||
        data.teams.some(
          (t) =>
            t.projectId === project?.id && t.teamId === r.teamId && t.reporterId === actor.user.id,
        )) &&
      (canReadTeam(actor, r.teamId) || actor.profile.dataScope === "SELF"),
    projectId: project?.id,
    projectName: project?.name,
    indicatorName: indicator?.name,
    unit: indicator?.unit,
    teamName: data.identity.orgs.find((o) => o.id === r.teamId)?.name,
    changes: data.changes
      .filter((c) => c.reportId === r.id)
      .map((c) => {
        const instance = data.instances.find(
          (i) => i.businessId === c.id && i.businessType === "MONTHLY_CHANGE",
        )
        return {
          ...c,
          instance: instance
            ? {
                ...instance,
                records: data.records
                  .filter((r) => r.instanceId === instance.id)
                  .map((r) => ({
                    ...r,
                    actorName:
                      data.identity.users.find((u) => u.id === r.actorId)?.name ?? "未知人员",
                  })),
              }
            : null,
        }
      }),
  }
}
/** 月报提交与指标统计服务；正式累计始终由有效行回算，不维护重复加算缓存。 */
export class ServiceService {
  constructor(readonly repository: ProjectRepository = projectRepository) {}
  /** 列表只返回可见记录，未提交且已删除的草稿从默认列表隐藏。 */
  list(actor: Actor, q: BusinessQuery) {
    requirePermission(actor, "service:monthly:view")
    return this.repository.read(actor, (data) =>
      pageResult(
        data.reports
          .filter(
            (r) =>
              canReadReport(data, data.actor!, r) &&
              !(r.status === "VOID" && !r.submittedAt) &&
              (!q.teamId || r.teamId === q.teamId) &&
              (!q.indicatorId || r.indicatorId === q.indicatorId) &&
              (!q.projectId ||
                data.indicators.some(
                  (i) => i.id === r.indicatorId && i.projectId === q.projectId,
                )) &&
              (!q.keyword ||
                `${data.projects.find((p) => p.id === data.indicators.find((i) => i.id === r.indicatorId)?.projectId)?.name} ${data.indicators.find((i) => i.id === r.indicatorId)?.name}`.includes(
                  q.keyword,
                )) &&
              (!q.month || r.month === q.month) &&
              (!q.status || r.status === q.status),
          )
          .map((r) => reportDto(data, r, data.actor!))
          .reverse(),
        q,
      ),
    )
  }
  /** 详情复用列表范围校验，保留该月报全部变更轮次。 */
  detail(actor: Actor, id: number) {
    requirePermission(actor, "service:monthly:view")
    return this.repository.read(actor, (data) => {
      const r = data.reports.find((r) => r.id === id)
      if (!r) throw AppError.notFound()
      assertBusinessAccess(canReadReport(data, data.actor!, r))
      return reportDto(data, r, data.actor!)
    })
  }
  /** 新建或更新草稿，唯一槽位存在时不插入第二份；已提交撤销不可绕过审批。 */
  save(actor: Actor, input: MonthlyInput, id?: number, version?: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      const { project, indicator, contract } = maintainReport(
        data,
        current,
        input.indicatorId,
        input.teamId,
        id ? "service:monthly:update" : "service:monthly:create",
      )
      if (project.status !== "ACTIVE" || indicator.status !== "ACTIVE" || !contract)
        throw AppError.conflict("请先启用项目及指标")
      assertReportMonth(input.month, contract.startDate, contract.endDate)
      decimalUnits(input.actualValue)
      const slot = data.reports.find(
        (r) =>
          r.indicatorId === input.indicatorId &&
          r.teamId === input.teamId &&
          r.month === input.month,
      )
      if (id && slot?.id !== id) throw AppError.conflict("指标、团队和月份不能修改")
      if (slot) {
        if (!id && slot.status === "VOID" && !slot.submittedAt) {
          id = slot.id
          version = slot.version
        }
        if (!id) throw AppError.conflict(`该月份已有记录（ID ${slot.id}），请编辑或申请恢复`)
        assertVersion(slot.version, version!)
        if (slot.status === "SUBMITTED" || slot.submittedAt)
          throw AppError.conflict("已提交记录须走更正或恢复审批")
        await tx.monthlyReports.update(slot.id, {
          actualValue: input.actualValue,
          note: input.note,
          status: "DRAFT",
          version: slot.version + 1,
        })
        id = slot.id
      } else {
        const [result] = await tx.monthlyReports.insert({ ...input, createdBy: current.user.id })
        id = result.insertId
      }
      await businessAudit(
        tx,
        current.user.id,
        "save-monthly",
        "monthly_report",
        id!,
        slot ?? null,
        input,
      )
      return { id: id! }
    })
  }
  /** 正式提交幂等；删除仅适用于从未提交的草稿，已提交记录需审批。 */
  state(actor: Actor, id: number, version: number, operation: "submit" | "delete") {
    return this.repository.write(actor, async (tx, data, current) => {
      const r = data.reports.find((r) => r.id === id)
      if (!r) throw AppError.notFound()
      const { project, indicator, contract } = maintainReport(
        data,
        current,
        r.indicatorId,
        r.teamId,
        `service:monthly:${operation}`,
      )
      if (operation === "submit" && r.status === "SUBMITTED") return { id }
      assertVersion(r.version, version)
      if (operation === "delete") {
        if (r.submittedAt || r.status !== "DRAFT") throw AppError.conflict("已提交记录须申请撤销")
        await tx.monthlyReports.update(id, { status: "VOID", version: r.version + 1 })
      } else {
        if (
          r.status !== "DRAFT" ||
          project.status !== "ACTIVE" ||
          indicator.status !== "ACTIVE" ||
          !contract
        )
          throw AppError.conflict("当前状态不能提交")
        assertReportMonth(r.month, contract.startDate, contract.endDate)
        await tx.monthlyReports.update(id, {
          status: "SUBMITTED",
          submittedAt: new Date(),
          submittedBy: current.user.id,
          version: r.version + 1,
        })
      }
      await businessAudit(tx, current.user.id, `${operation}-monthly`, "monthly_report", id, r, {
        operation,
      })
      return { id }
    })
  }
  /** 进度和预警使用同一授权与计算口径；导出调用时复用此处的完整结果。 */
  progress(actor: Actor, q: BusinessQuery, permission = "service:indicator:view") {
    requirePermission(actor, permission)
    return this.repository.read(actor, (data) => this.progressRows(data, data.actor!, q))
  }
  /** 从单一事务快照计算所有筛选后的团队及合同指标，不跨口径求和。 */
  progressRows(data: BusinessState, actor: Actor, q: BusinessQuery) {
    const asOfDate = q.asOfDate ?? businessToday()
    if (asOfDate > businessToday()) throw AppError.badRequest("查询日期不能晚于今天")
    const rows = []
    for (const indicator of data.indicators.filter(
      (i) => !i.deletedAt && i.status === "ACTIVE" && (!q.indicatorId || i.id === q.indicatorId),
    )) {
      const p = data.projects.find((p) => p.id === indicator.projectId && !p.deletedAt),
        c = data.contracts.find((c) => c.projectId === indicator.projectId)
      if (
        !p ||
        !c ||
        (q.projectId && p.id !== q.projectId) ||
        (q.serviceFieldCode && p.serviceFieldCode !== q.serviceFieldCode) ||
        (q.serviceArea && !c.serviceArea.includes(q.serviceArea)) ||
        (q.keyword && !`${p.name} ${indicator.name}`.includes(q.keyword))
      )
        continue
      const teams = visibleTeams(data, actor, p.id).filter(
        (t) => !q.teamId || q.teamId === t.teamId,
      )
      const base = {
        projectId: p.id,
        projectName: p.name,
        indicatorId: indicator.id,
        indicatorName: indicator.name,
        unit: indicator.unit,
        definition: indicator.definition,
        serviceFieldCode: p.serviceFieldCode,
        serviceArea: c.serviceArea,
        endDate: c.endDate,
        asOfDate,
        month: asOfDate.slice(0, 7),
        calculationNote: "按现有有效记录回算",
      }
      const actual = (teamId?: number, monthOnly = false) =>
        sumValues(
          data.reports
            .filter(
              (r) =>
                r.indicatorId === indicator.id &&
                (!teamId || r.teamId === teamId) &&
                canReadReport(data, actor, r) &&
                r.status === "SUBMITTED" &&
                (monthOnly ? r.month === asOfDate.slice(0, 7) : r.month <= asOfDate.slice(0, 7)),
            )
            .map((r) => r.actualValue),
        )
      if (!q.teamId && fullProject(data, actor, p)) {
        const cumulative = actual()
        rows.push({
          ...base,
          statisticsScope: "PROJECT",
          teamId: null as number | null,
          teamName: "完整合同",
          targetValue: indicator.targetValue,
          monthlyValue: actual(undefined, true),
          cumulative,
          ...indicatorWarning(indicator.targetValue, cumulative, c.startDate, c.endDate, asOfDate),
        })
      }
      for (const team of teams) {
        const target = data.targets.find(
          (t) => t.indicatorId === indicator.id && t.teamId === team.teamId,
        )
        if (!target) continue
        const cumulative = actual(team.teamId),
          complete = canReadTeam(actor, team.teamId)
        rows.push({
          ...base,
          statisticsScope: complete ? "TEAM" : "SELF",
          canReport:
            (actor.profile.roles.includes("admin") || team.reporterId === actor.user.id) &&
            (complete || actor.profile.dataScope === "SELF"),
          teamId: team.teamId,
          teamName: data.identity.orgs.find((o) => o.id === team.teamId)?.name ?? "",
          targetValue: target.targetValue,
          monthlyValue: actual(team.teamId, true),
          cumulative,
          ...(complete
            ? indicatorWarning(target.targetValue, cumulative, c.startDate, c.endDate, asOfDate)
            : {
                completionRate: null,
                warningLevel: null,
                overdue: false,
                notStarted: asOfDate < c.startDate,
              }),
        })
      }
    }
    return rows.filter((row) => !q.warningLevel || row.warningLevel === q.warningLevel)
  }
}
export const serviceService = new ServiceService()
