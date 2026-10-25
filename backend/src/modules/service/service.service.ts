import { matchesRecordChange } from "@/modules/approval/approval-link"
import * as s from "@/db/schema"
import { requirePermission, assertVersion, type Actor } from "@/utils/authorization"
import {
  canReadTeam,
  assertBusinessAccess,
  canMaintainProject,
  canConfigureProjects,
} from "@/utils/business-scope"
import { AppError } from "@/utils/errors"
import { decimalUnits } from "@/utils/decimal"
import { businessAudit } from "@/utils/business-audit"
import {
  projectRepository,
  type ProjectRepository,
  type BusinessState,
} from "@/modules/project/project.repository"
import { findProject, visibleTeams, fullProject } from "@/modules/project/project.service"
import { sortRows, sortDecimal } from "@/utils/list-sort"
import { pageResult, type BusinessQuery } from "@/modules/project/project.validation"
import { businessToday, sumValues, indicatorWarning } from "./indicator-calculation"
import { actorFrom } from "@/modules/identity/identity.service"
import type { MonthlyInput } from "./service.validation"
export type Monthly = typeof s.monthlyReports.$inferSelect
/** 服务档案按项目负责信息或本人服务团队及成员关系裁剪读取。 */
export function canReadReport(data: BusinessState, actor: Actor, r: Monthly) {
  const indicator = data.indicators.find((i) => i.id === r.indicatorId)
  const p = data.projects.find((p) => p.id === indicator?.projectId && !p.deletedAt)
  return (
    !!p &&
    (canMaintainProject(actor, p) ||
      (r.teamId === actor.profile.teamId &&
        data.members.some(
          (m) => m.projectId === p.id && m.userId === actor.user.id && m.teamId === r.teamId,
        )))
  )
}
/** 填报校验动作和项目维护能力或团队成员关系，团队目标及日期规则始终适用。 */
export function maintainReport(
  data: BusinessState,
  actor: Actor,
  indicatorId: number,
  teamId: number,
  permission: string,
  serviceDate?: string,
) {
  requirePermission(actor, permission)
  const indicator = data.indicators.find((i) => i.id === indicatorId && !i.deletedAt)
  if (!indicator) throw AppError.notFound()
  const project = findProject(data, indicator.projectId)
  const team = data.teams.find((t) => t.projectId === project.id && t.teamId === teamId)
  const membership = data.members.find(
    (m) =>
      m.projectId === project.id &&
      m.userId === actor.user.id &&
      m.teamId === teamId &&
      (!serviceDate || (m.startDate <= serviceDate && m.endDate >= serviceDate)),
  )
  assertBusinessAccess(
    !!team &&
      (canMaintainProject(actor, project) || (actor.profile.teamId === teamId && !!membership)),
  )
  if (
    !data.identity.orgs.some((o) => o.id === teamId && o.type === "TEAM" && o.status === "ACTIVE")
  )
    throw AppError.conflict("服务团队已停用")
  if (!data.targets.some((t) => t.indicatorId === indicatorId && t.teamId === teamId))
    throw AppError.conflict("未分配该指标的团队目标")
  return { project, indicator, contract: data.contracts.find((c) => c.projectId === project.id) }
}
/** 校验实际日期和合同期间，避免伪造日期与超前填报。 */
function assertServiceDate(value: string, start: string, end: string) {
  const d = new Date(`${value}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value ||
    value < start ||
    value > end ||
    value > businessToday()
  )
    throw AppError.badRequest("服务日期须有效、处于合同周期内且不得晚于今天")
}
/** 输出服务档案及首次、变更审批历史，不夹带项目其他团队数据。 */
export function reportDto(data: BusinessState, r: Monthly, actor: Actor) {
  const indicator = data.indicators.find((i) => i.id === r.indicatorId),
    project = data.projects.find((p) => p.id === indicator?.projectId)
  return {
    ...r,
    canMaintain:
      !!project &&
      (canMaintainProject(actor, project) ||
        (r.teamId === actor.profile.teamId &&
          data.members.some(
            (m) =>
              m.projectId === project.id && m.userId === actor.user.id && m.teamId === r.teamId,
          ))),
    submissions: data.instances
      .filter((i) => i.businessType === "SERVICE_SUBMISSION" && i.businessId === r.id)
      .map((i) => ({
        ...i,
        records: data.records
          .filter((record) => record.instanceId === i.id)
          .map((record) => ({
            ...record,
            actorName: data.identity.users.find((u) => u.id === record.actorId)?.name ?? "未知人员",
          })),
      })),
    projectId: project?.id,
    projectName: project?.name,
    indicatorName: indicator?.name,
    unit: indicator?.unit,
    teamName: data.identity.orgs.find((o) => o.id === r.teamId)?.name,
    changes: data.changes
      .filter((c) => c.reportId === r.id)
      .map((c) => {
        const instance = data.instances.find((i) => matchesRecordChange(data, i, c))
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
/** 服务档案与指标统计服务；正式累计由已生效有效行回算，不维护重复加算缓存。 */
export class ServiceService {
  constructor(readonly repository: ProjectRepository = projectRepository) {}
  /** 列表只返回可见记录，未提交且已删除的草稿从默认列表隐藏。 */
  list(actor: Actor, q: BusinessQuery) {
    requirePermission(actor, "service:monthly:view")
    return this.repository.read(actor, (data) =>
      pageResult(
        sortRows(
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
            .map((r) => reportDto(data, r, data.actor!)),
          q,
          {
            id: (r) => r.id,
            projectName: (r) => r.projectName,
            indicatorName: (r) => r.indicatorName,
            teamName: (r) => r.teamName,
            month: (r) => r.month,
            serviceDate: (r) => r.serviceDate ?? `${r.month}-00`,
            createdAt: (r) => r.createdAt,
            actualValue: (r) => sortDecimal(r.actualValue),
          },
          [
            ["serviceDate", "desc"],
            ["createdAt", "desc"],
            ["id", "desc"],
          ],
        ),
        q,
      ),
    )
  }
  /** 详情复用列表范围校验，保留首次提交及全部变更轮次。 */
  detail(actor: Actor, id: number) {
    requirePermission(actor, "service:monthly:view")
    return this.repository.read(actor, (data) => {
      const r = data.reports.find((r) => r.id === id)
      if (!r) throw AppError.notFound()
      assertBusinessAccess(canReadReport(data, data.actor!, r))
      return reportDto(data, r, data.actor!)
    })
  }
  /** 填报上下文从明确的有效项目归属取得，项目与指标、团队分开显示。 */
  context(actor: Actor) {
    requirePermission(actor, "service:monthly:create")
    return this.repository.read(actor, (data) => {
      const current = data.actor!,
        today = businessToday()
      const projects = data.projects.filter(
        (p) =>
          p.status === "ACTIVE" &&
          (canMaintainProject(current, p) ||
            data.members.some(
              (m) =>
                m.projectId === p.id &&
                m.userId === current.user.id &&
                m.teamId === current.profile.teamId &&
                m.startDate <= today &&
                m.endDate >= today,
            )),
      )
      if (!canConfigureProjects(current) && projects.length > 1)
        throw AppError.conflict("存在多个有效合同包项目归属，请联系负责人调整后填报")
      const slots = projects.flatMap((p) =>
        data.indicators
          .filter((i) => i.projectId === p.id && i.status === "ACTIVE" && !i.deletedAt)
          .flatMap((i) =>
            data.targets
              .filter(
                (t) =>
                  t.indicatorId === i.id &&
                  (canMaintainProject(current, p) || t.teamId === current.profile.teamId),
              )
              .map((t) => ({
                projectId: p.id,
                projectName: p.name,
                indicatorId: i.id,
                indicatorName: i.name,
                unit: i.unit,
                teamId: t.teamId,
                teamName: data.identity.orgs.find((o) => o.id === t.teamId)?.name ?? "",
              })),
          ),
      )
      return {
        fixedProject: !canConfigureProjects(current),
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        slots,
      }
    })
  }
  /** 按次草稿允许同日同指标多条记录；幂等键只合并同一次请求的重试。 */
  save(actor: Actor, input: MonthlyInput, id?: number, version?: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      const { project, indicator, contract } = maintainReport(
        data,
        current,
        input.indicatorId,
        input.teamId,
        id ? "service:monthly:update" : "service:monthly:create",
        input.serviceDate,
      )
      if (project.status !== "ACTIVE" || indicator.status !== "ACTIVE" || !contract)
        throw AppError.conflict("请先启用项目及指标")
      assertServiceDate(input.serviceDate, contract.startDate, contract.endDate)
      if (!canConfigureProjects(current)) {
        const active = new Set(
          data.members
            .filter(
              (m) =>
                m.userId === current.user.id &&
                m.startDate <= businessToday() &&
                m.endDate >= businessToday() &&
                data.projects.some(
                  (p) => p.id === m.projectId && p.status === "ACTIVE" && !p.deletedAt,
                ),
            )
            .map((m) => m.projectId),
        )
        assertBusinessAccess(
          active.size === 1 && active.has(project.id),
          "请使用当前唯一负责的合同包项目填报",
        )
      }
      decimalUnits(input.actualValue)
      const payload = {
        indicatorId: input.indicatorId,
        teamId: input.teamId,
        serviceDate: input.serviceDate,
        month: input.serviceDate.slice(0, 7),
        actualValue: input.actualValue,
        note: input.note,
      }
      const old = id ? data.reports.find((r) => r.id === id) : undefined
      if (id) {
        if (!old) throw AppError.notFound()
        assertVersion(old.version, version!)
        assertBusinessAccess(canReadReport(data, current, old))
        if (!["DRAFT", "REJECTED"].includes(old.status) || old.submittedAt || old.legacyReportId)
          throw AppError.conflict("仅可编辑未生效的逐次服务档案草稿")
        if (old.indicatorId !== input.indicatorId || old.teamId !== input.teamId)
          throw AppError.conflict("已保存的指标及团队不能修改")
        await tx.monthlyReports.update(id, {
          ...payload,
          status: "DRAFT",
          version: old.version + 1,
        })
      } else {
        const key = input.requestKey ?? crypto.randomUUID()
        const existing = data.reports.find(
          (r) => r.createdBy === current.user.id && r.requestKey === key,
        )
        if (existing) {
          if (
            existing.indicatorId !== payload.indicatorId ||
            existing.teamId !== payload.teamId ||
            existing.serviceDate !== payload.serviceDate ||
            decimalUnits(existing.actualValue) !== decimalUnits(payload.actualValue) ||
            (existing.note ?? "") !== (payload.note ?? "")
          )
            throw AppError.conflict("同一提交标识对应的填报内容已变化")
          return { id: existing.id }
        }
        const [result] = await tx.monthlyReports.insert({
          ...payload,
          createdBy: current.user.id,
          requestKey: key,
        })
        id = result.insertId
      }
      await businessAudit(
        tx,
        current.user.id,
        "save-service-record",
        "service_record",
        id!,
        old ?? null,
        payload,
      )
      return { id: id! }
    })
  }
  /** 首次提交生成直接主管单级任务，草稿和待审记录均不计累计。 */
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
      assertBusinessAccess(canReadReport(data, current, r))
      if (operation === "submit" && ["IN_REVIEW", "SUBMITTED"].includes(r.status)) return { id }
      assertVersion(r.version, version)
      if (!["DRAFT", "REJECTED"].includes(r.status) || r.submittedAt)
        throw AppError.conflict("当前状态不允许该操作")
      if (operation === "delete") {
        await tx.monthlyReports.update(id, { status: "VOID", version: r.version + 1 })
      } else {
        if (
          !r.serviceDate ||
          project.status !== "ACTIVE" ||
          indicator.status !== "ACTIVE" ||
          !contract
        )
          throw AppError.conflict("请补齐服务日期并启用项目及指标")
        assertServiceDate(r.serviceDate, contract.startDate, contract.endDate)
        const supervisor = data.identity.users.find(
          (u) => u.id === current.user.supervisorId && u.status === "ACTIVE",
        )
        if (!supervisor || supervisor.id === current.user.id)
          throw AppError.conflict("请先配置启用的直接主管，且不得自审")
        requirePermission(actorFrom(data.identity, supervisor), "service:monthly:approve")
        const [instance] = await tx.approvalInstances.insert({
          businessType: "SERVICE_SUBMISSION",
          businessId: r.id,
          round:
            data.instances.filter(
              (i) => i.businessType === "SERVICE_SUBMISSION" && i.businessId === r.id,
            ).length + 1,
          applicantId: current.user.id,
          workflowSnapshot: {
            schemaVersion: 1,
            nodes: [{ nodeNo: 1, name: "直接主管确认", approverIds: [supervisor.id] }],
          },
          businessSnapshot: {
            reportId: r.id,
            projectId: project.id,
            projectName: project.name,
            indicatorId: indicator.id,
            indicatorName: indicator.name,
            teamId: r.teamId,
            teamName: data.identity.orgs.find((o) => o.id === r.teamId)?.name,
            serviceDate: r.serviceDate,
            month: r.month,
            operation: "SUBMIT",
            beforeValue: "0.00",
            proposedValue: r.actualValue,
            note: r.note,
            reportVersion: r.version + 1,
          },
        })
        await tx.approvalTasks.insert({ instanceId: instance.insertId, approverId: supervisor.id })
        await tx.approvalRecords.insert({
          instanceId: instance.insertId,
          actorId: current.user.id,
          action: "SUBMIT",
        })
        await tx.monthlyReports.update(id, { status: "IN_REVIEW", version: r.version + 1 })
      }
      await businessAudit(
        tx,
        current.user.id,
        `${operation}-service-record`,
        "service_record",
        id,
        r,
        { operation },
      )
      return { id }
    })
  }
  /** 发起人可撤回首次在途提交，保留本轮记录并回到草稿。 */
  withdrawSubmission(actor: Actor, id: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      requirePermission(current, "service:monthly:submit")
      const r = data.reports.find((r) => r.id === id),
        instance = data.instances.find(
          (i) =>
            i.businessType === "SERVICE_SUBMISSION" &&
            i.businessId === id &&
            i.status === "IN_REVIEW",
        )
      if (!r || !instance) throw AppError.conflict("该记录没有待处理的首次提交")
      assertBusinessAccess(
        instance.applicantId === current.user.id && canReadReport(data, current, r),
      )
      await tx.monthlyReports.update(id, { status: "DRAFT", version: r.version + 1 })
      await tx.approvalInstances.update(instance.id, {
        status: "CANCELLED",
        completedAt: new Date(),
        version: instance.version + 1,
      })
      for (const t of data.tasks.filter(
        (t) => t.instanceId === instance.id && t.status === "PENDING",
      ))
        await tx.approvalTasks.update(t.id, { status: "CANCELLED", version: t.version + 1 })
      await tx.approvalRecords.insert({
        instanceId: instance.id,
        actorId: current.user.id,
        action: "WITHDRAW",
      })
      await businessAudit(
        tx,
        current.user.id,
        "withdraw-service-submission",
        "service_record",
        id,
        null,
        { instanceId: instance.id },
      )
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
        (q.serviceArea && c.serviceArea !== q.serviceArea) ||
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
                (!r.serviceDate || r.serviceDate <= asOfDate) &&
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
            canMaintainProject(actor, p) ||
            data.members.some(
              (m) =>
                m.projectId === p.id &&
                m.teamId === team.teamId &&
                m.userId === actor.user.id &&
                m.startDate <= businessToday() &&
                m.endDate >= businessToday(),
            ),
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
    return sortRows(
      rows.filter((row) => !q.warningLevel || row.warningLevel === q.warningLevel),
      q,
      {
        projectName: (r) => r.projectName,
        indicatorName: (r) => r.indicatorName,
        teamName: (r) => r.teamName,
        targetValue: (r) => sortDecimal(r.targetValue),
        monthlyValue: (r) => sortDecimal(r.monthlyValue),
        cumulative: (r) => sortDecimal(r.cumulative),
        completionRate: (r) => r.completionRate,
        endDate: (r) => r.endDate,
        warningLevel: (r) =>
          r.warningLevel == null
            ? null
            : { red: 0, orange: 1, yellow: 2, green: 3 }[r.warningLevel],
        projectId: (r) => r.projectId,
        indicatorId: (r) => r.indicatorId,
        statisticsScope: (r) => r.statisticsScope,
        teamId: (r) => r.teamId ?? 0,
      },
      [
        ["endDate", "asc"],
        ["projectId", "asc"],
        ["indicatorId", "asc"],
        ["statisticsScope", "asc"],
        ["teamId", "asc"],
      ],
    )
  }
}
export const serviceService = new ServiceService()
