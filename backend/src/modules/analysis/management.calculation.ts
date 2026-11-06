import { canMaintainProject, isManagement } from "@/utils/business-scope"
import type { Actor } from "@/utils/authorization"
import { requirePermission } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { ServiceService, canReadReport } from "@/modules/service/service.service"
import { applicablePlan } from "@/modules/task/plan.service"
import { outcomeTaskState } from "@/modules/outcome/outcome.status"
import { taskReadable } from "@/modules/task/task.authorization"
import { businessDate, dateValid, fingerprint } from "@/modules/task/task-calendar"
import { canReadResource, relationship } from "@/modules/resource/resource.service"
import { regionMatches, validateRegionQuery, regionDisplay } from "@/modules/region/region.shared"
import { matchesRecordChange, isHandledApproval } from "@/modules/approval/approval-link"
import { decimalUnits, decimalText } from "@/utils/decimal"
import type { ManagementState } from "@/modules/management/management.repository"
import type { ReportKind, ReportQuery } from "./management.validation"
export type ReportRow = {
  key: string
  href: string
  status: string
  [key: string]: string | number | null
}
export type ReportColumn = { key: string; label: string }
const permission: Record<ReportKind, string> = {
  progress: "analysis:report:view",
  tasks: "activity:view",
  approvals: "service:monthly:view",
  resources: "resource:view",
}
export const reportLabels = {
  progress: "项目进度",
  tasks: "任务执行",
  approvals: "审批时效",
  resources: "资源合作",
}
export const taskLabels: Record<string, string> = {
  TO_REGISTER: "待登记",
  TO_SUBMIT: "待提交",
  REJECTED: "已退回",
  TO_CORRECT: "待更正",
  IN_REVIEW: "待审批",
  COMPLETED: "已完成",
  CANCELED: "已取消",
  SCHEDULED: "待开展",
  IN_PROGRESS: "进行中",
  TO_ORGANIZE: "待整理",
  PENDING: "待审批",
  APPROVED: "已通过",
  CANCELLED: "已撤回",
}
const col = (key: string, label: string) => ({ key, label })
export function normalizeReportQuery(kind: ReportKind, input: ReportQuery, now = new Date()) {
  const {
    fingerprint: _,
    page: __,
    pageSize: ___,
    referenceTime: ____,
    rowKey: _____,
    ...raw
  } = input
  void _
  void __
  void ___
  void ____
  void _____
  const q: ReportQuery = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""),
  )
  const allowed: Record<ReportKind, string[]> = {
    progress: [
      "projectId",
      "teamId",
      "indicatorId",
      "regionCode",
      "serviceFieldCode",
      "keyword",
      "asOfDate",
    ],
    tasks: [
      "projectId",
      "teamId",
      "ownerId",
      "regionCode",
      "keyword",
      "status",
      "form",
      "dateFrom",
      "dateTo",
    ],
    approvals: ["projectId", "teamId", "keyword", "status", "dateFrom", "dateTo"],
    resources: [
      "ownerId",
      "regionCode",
      "keyword",
      "status",
      "unitType",
      "relationship",
      "dateFrom",
      "dateTo",
    ],
  }
  if (Object.keys(q).some((k) => !allowed[kind].includes(k)))
    throw AppError.badRequest("所选报告不支持该筛选条件")
  for (const d of [q.asOfDate, q.dateFrom, q.dateTo])
    if (d && !dateValid(d)) throw AppError.badRequest("查询日期无效")
  if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo) throw AppError.badRequest("查询日期范围无效")
  if (q.asOfDate && q.asOfDate > businessDate(now))
    throw AppError.badRequest("查询日期不能晚于今天")
  if (input.pageSize && ![10, 20, 50, 100].includes(input.pageSize))
    throw AppError.badRequest("请选择10、20、50或100条")
  if (kind === "progress") q.asOfDate ??= businessDate(now)
  return Object.fromEntries(Object.entries(q).sort(([a], [b]) => a.localeCompare(b))) as ReportQuery
}
function signed(value: bigint) {
  return value < 0n ? `-${decimalText(-value)}` : decimalText(value)
}
function matches(value: string, q: ReportQuery) {
  return (!q.dateFrom || value >= q.dateFrom) && (!q.dateTo || value <= q.dateTo)
}
export function calculateReport(
  data: ManagementState,
  actor: Actor,
  kind: ReportKind,
  input: ReportQuery,
  now = new Date(),
  purpose: "analysis" | "dashboard" = "analysis",
) {
  if (purpose === "analysis") requirePermission(actor, "analysis:report:view")
  if (kind === "approvals") {
    if (
      !actor.profile.permissions.includes("service:monthly:view") &&
      !actor.profile.permissions.includes("service:monthly:approve")
    )
      throw AppError.forbidden()
  } else
    requirePermission(
      actor,
      kind === "progress" &&
        purpose === "dashboard" &&
        actor.profile.permissions.includes("service:indicator:view")
        ? "service:indicator:view"
        : permission[kind],
    )
  if (kind === "progress" || kind === "tasks")
    data = {
      ...data,
      projects: data.projects.filter(
        (p) =>
          !p.deletedAt &&
          (canMaintainProject(actor, p) ||
            (!isManagement(actor) &&
              data.teams.some((t) => t.projectId === p.id && t.teamId === actor.profile.teamId))),
      ),
    }
  const q = normalizeReportQuery(kind, input, now)
  validateRegionQuery(data.regions, q)
  const reference = input.referenceTime ? new Date(input.referenceTime) : now
  if (!Number.isFinite(reference.getTime()) || reference > now)
    throw AppError.badRequest("报表参考时间无效")
  let rows: ReportRow[] = [],
    columns: ReportColumn[] = [],
    basis = ""
  const details: Record<string, ReportRow[]> = {}
  const name = (id: number) => data.identity.users.find((u) => u.id === id)?.name ?? "历史人员"
  if (kind === "progress") {
    columns = [
      col("projectName", "项目"),
      col("teamName", "范围"),
      col("indicatorName", "指标"),
      col("unit", "单位"),
      col("targetValue", "总目标"),
      col("cumulative", "正式完成"),
      col("planName", "阶段计划"),
      col("expected", "阶段应完成"),
      col("currentTarget", "当前阶段目标"),
      col("difference", "阶段尚差"),
      col("stageRate", "阶段完成率(%)"),
      col("pending", "首次待审条数"),
      col("corrections", "更正待审条数"),
    ]
    basis =
      "按当前有效已批准档案的业务日期回算；人数去重、工时取并集。阶段只比较已到期目标，合同与团队不相加；待审不计正式量。"
    rows = new ServiceService().progressRows(data, actor, q).map((r) => {
      const target = data.targets.find(
        (t) => t.indicatorId === r.indicatorId && t.teamId === r.teamId,
      )
      const plan = target ? applicablePlan(data, target.id, q.asOfDate!) : undefined
      const stale =
        !!plan &&
        (plan.targetVersion !== target!.version ||
          plan.indicatorVersion !== data.indicators.find((i) => i.id === r.indicatorId)?.version)
      const complete = r.statisticsScope === "TEAM"
      const periods = plan ? data.scheduling.periods.filter((p) => p.planId === plan.id) : []
      const expected =
        complete && plan && !stale
          ? periods
              .filter((p) => p.endDate <= q.asOfDate!)
              .reduce((n, p) => n + decimalUnits(p.targetValue), 0n)
          : null
      const current =
        complete && plan && !stale
          ? periods.find((p) => p.startDate <= q.asOfDate! && p.endDate > q.asOfDate!)
          : undefined
      const eligible = data.reports.filter(
        (x) =>
          x.indicatorId === r.indicatorId &&
          (!r.teamId || x.teamId === r.teamId) &&
          canReadReport(data, actor, x),
      )
      const visible = eligible.filter((x) =>
        x.serviceDate ? x.serviceDate <= q.asOfDate! : x.month <= q.asOfDate!.slice(0, 7),
      )
      const pending = visible.filter((x) => x.status === "IN_REVIEW")
      const corrections = data.changes.filter(
        (c) => c.pendingReportId && visible.some((x) => x.id === c.reportId),
      )
      const key = `${r.statisticsScope}-${r.indicatorId}-${r.teamId ?? 0}`
      details[key] = [
        ...visible
          .filter((x) => ["SUBMITTED", "IN_REVIEW"].includes(x.status))
          .map((x) => ({
            key: `record-${x.id}`,
            href: actor.profile.permissions.includes("service:monthly:view")
              ? `/service/records?recordId=${x.id}`
              : "",
            status: x.status,
            source: `档案${x.id}`,
            date: x.serviceDate ?? x.month,
            value: x.actualValue,
            note:
              x.status === "SUBMITTED" ? "有效档案，汇总按去重／时段口径重新计算" : "首次申报待审",
          })),
        ...corrections.map((c) => ({
          key: `change-${c.id}`,
          href: actor.profile.permissions.includes("service:monthly:view")
            ? `/service/records?recordId=${c.reportId}`
            : "",
          status: "CHANGE_IN_REVIEW",
          source: `更正${c.id}`,
          date: "",
          value: c.proposedValue,
          note: "更正待审，原正式值保持",
        })),
      ]
      return {
        key,
        href: actor.profile.permissions.includes("project:record:view")
          ? `/service/contract-package-projects/${r.projectId}`
          : "",
        status: stale
          ? "计划待调整"
          : r.statisticsScope === "SELF"
            ? "本人记录"
            : !complete
              ? "合同目标"
              : !plan
                ? "计划待制定"
                : expected !== null && expected > decimalUnits(r.cumulative)
                  ? "阶段尚差"
                  : "阶段已达标",
        projectName: r.projectName,
        teamName: r.teamName,
        indicatorName: r.indicatorName,
        indicatorId: r.indicatorId,
        unit: r.unit,
        targetValue: r.targetValue,
        cumulative: r.cumulative,
        warningLevel: r.warningLevel,
        planName: complete
          ? plan
            ? `第${plan.revision}版${stale ? "（待调整）" : ""}`
            : "待制定"
          : "—",
        expected: expected === null ? null : decimalText(expected),
        currentTarget: current?.targetValue ?? null,
        difference: expected === null ? null : signed(expected - decimalUnits(r.cumulative)),
        stageRate:
          expected === null || expected === 0n
            ? null
            : Number((decimalUnits(r.cumulative) * 10000n) / expected) / 100,
        pending: pending.length,
        corrections: corrections.length,
      }
    })
  }
  if (kind === "tasks") {
    columns = [
      col("title", "任务"),
      col("projectName", "项目"),
      col("teamName", "团队"),
      col("ownerName", "负责人"),
      col("startDate", "计划开始"),
      col("endDate", "计划结束"),
      col("status", "当前状态"),
      col("location", "地点"),
    ]
    basis = "按计划日期交集筛选，每任务一条；状态为生成时当前新旧流程聚合状态。"
    rows = data.scheduling.tasks
      .filter(
        (t) =>
          taskReadable(data, actor, t.projectId, t.teamId) &&
          (!q.projectId || t.projectId === q.projectId) &&
          (!q.teamId || t.teamId === q.teamId) &&
          (!q.ownerId || t.leaderId === q.ownerId) &&
          (!q.keyword || t.title.includes(q.keyword)) &&
          (!q.form || t.form === q.form) &&
          (!q.dateFrom || businessDate(new Date(t.endAt.getTime() - 1)) >= q.dateFrom) &&
          (!q.dateTo || businessDate(t.startAt) <= q.dateTo) &&
          regionMatches(data.regions, q.regionCode, t),
      )
      .map((t) => {
        const state = outcomeTaskState(data, t.id),
          code = state.registrationState ?? state.state
        return {
          key: `task-${t.id}`,
          href: `/activity/${t.id}`,
          status: taskLabels[code] ?? code,
          stateCode: code,
          title: t.title,
          projectName: data.projects.find((p) => p.id === t.projectId)?.name ?? "",
          teamName: data.identity.orgs.find((o) => o.id === t.teamId)?.name ?? "",
          ownerId: t.leaderId,
          ownerName: name(t.leaderId),
          startDate: businessDate(t.startAt),
          endDate: businessDate(new Date(t.endAt.getTime() - 1)),
          location: `${regionDisplay(t)} ${t.location}`,
          version: t.version,
        }
      })
      .filter((t) => !q.status || t.stateCode === q.status)
  }
  if (kind === "approvals") {
    columns = [
      col("source", "审批轮次"),
      col("projectName", "项目"),
      col("applicantName", "发起人"),
      col("approverName", "实际审批人"),
      col("submittedAt", "提交时间"),
      col("decidedAt", "处理时间"),
      col("status", "状态"),
      col("hours", "等待／处理小时"),
    ]
    basis =
      "仅本人发起或实际审批任务；重提按轮次，撤回单列。待审等待计算至生成时间，已办计算至本轮决定，不混合样本。"
    for (const i of data.instances) {
      if (!isHandledApproval(data, i)) continue
      const canApplicant =
        i.applicantId === actor.user.id &&
        actor.profile.permissions.includes("service:monthly:view")
      const task = data.tasks.find((t) => t.instanceId === i.id && t.approverId === actor.user.id)
      if (!canApplicant && !(task && actor.profile.permissions.includes("service:monthly:approve")))
        continue
      const record =
        i.businessType === "SERVICE_SUBMISSION"
          ? data.reports.find((r) => r.id === i.businessId)
          : data.reports.find((r) =>
              data.changes.some((c) => c.reportId === r.id && matchesRecordChange(data, i, c)),
            )
      const summary =
        i.businessType === "TASK_SUMMARY"
          ? data.outcomes.outcomes.find((o) => o.id === i.businessId)
          : undefined
      const serviceTask = data.scheduling.tasks.find((t) => t.id === summary?.taskId)
      const pid =
        serviceTask?.projectId ??
        data.indicators.find((x) => x.id === record?.indicatorId)?.projectId
      const tid = serviceTask?.teamId ?? record?.teamId
      if (
        (q.projectId && pid !== q.projectId) ||
        (q.teamId && tid !== q.teamId) ||
        !matches(businessDate(i.createdAt), q)
      )
        continue
      const actual = data.tasks.filter((t) => t.instanceId === i.id).sort((a, b) => a.id - b.id)[0]
      if (!actual) continue
      const status = i.status === "CANCELLED" ? "CANCELLED" : actual.status
      const end = status === "PENDING" ? reference : (actual.decidedAt ?? i.completedAt)
      const projectName = data.projects.find((p) => p.id === pid)?.name ?? "历史项目"
      if (
        (q.status && q.status !== status) ||
        (q.keyword && !`${projectName} ${name(i.applicantId)}`.includes(q.keyword))
      )
        continue
      rows.push({
        key: `approval-${i.id}`,
        href: `/service/approvals?instanceId=${i.id}`,
        status: taskLabels[status] ?? status,
        stateCode: status,
        source: `审批${i.id}／第${i.round}轮`,
        projectName,
        applicantName: name(i.applicantId),
        approverName: name(actual.approverId),
        submittedAt: i.createdAt.toISOString(),
        decidedAt: actual.decidedAt?.toISOString() ?? null,
        hours:
          status === "CANCELLED" || !end
            ? null
            : Math.round(Math.max(0, end.getTime() - i.createdAt.getTime()) / 36000) / 100,
        version: i.version,
      })
    }
  }
  if (kind === "resources") {
    columns = [
      col("resourceName", "单位资源"),
      col("relationship", "合作关系"),
      col("nextAction", "下一行动"),
      col("ownerName", "下一负责人"),
      col("dueDate", "计划日期"),
      col("status", "跟进状态"),
      col("region", "地区"),
    ]
    basis =
      "按资源授权范围，独立于项目权限；每条跟进一行，没有跟进的单位单列。仅已明确下一行动、负责人、期限且未完成的事项判断逾期。"
    for (const unit of data.scheduling.units.filter(
      (r) =>
        canReadResource(actor, r) &&
        r.status !== "MERGED" &&
        (!q.keyword || r.name.includes(q.keyword)) &&
        (!q.unitType || r.unitType === q.unitType) &&
        regionMatches(data.regions, q.regionCode, r),
    )) {
      const valid = data.cooperations.filter(
        (c) =>
          c.resourceId === unit.id &&
          (c.type !== "CONTRACT" ||
            data.projects.some(
              (p) => p.id === c.projectId && !p.deletedAt && p.status === "ACTIVE",
            )),
      )
      const rel = relationship(valid, businessDate(reference))
      if (q.relationship && rel !== q.relationship) continue
      const items = data.resourceFollowups.filter((f) => f.resourceId === unit.id)
      const append = (f: (typeof items)[number] | null) => {
        const due = !!f?.nextAction.trim() && !!f.nextOwnerId && !!f.nextDueDate
        const code = !f
          ? "NO_FOLLOWUP"
          : f.completed
            ? "COMPLETED"
            : due && f.nextDueDate! < businessDate(reference)
              ? "OVERDUE"
              : due
                ? "PENDING"
                : "UNSCHEDULED"
        if (
          (q.ownerId && f?.nextOwnerId !== q.ownerId) ||
          (q.status && code !== q.status) ||
          ((q.dateFrom || q.dateTo) && (!f?.nextDueDate || !matches(f.nextDueDate, q)))
        )
          return
        rows.push({
          key: f ? `resource-followup-${f.id}` : `resource-${unit.id}`,
          href: `/resource/${unit.id}${f ? `?followupId=${f.id}` : ""}`,
          status: {
            NO_FOLLOWUP: "未登记跟进",
            COMPLETED: "已完成",
            OVERDUE: "已逾期",
            PENDING: "待跟进",
            UNSCHEDULED: "普通记录",
          }[code],
          stateCode: code,
          resourceName: unit.name,
          relationship: { CURRENT: "正在合作", POTENTIAL: "潜在合作", HISTORICAL: "历史合作" }[rel],
          nextAction: f?.nextAction ?? "",
          ownerId: f?.nextOwnerId ?? null,
          ownerName: f?.nextOwnerId ? name(f.nextOwnerId) : "—",
          dueDate: f?.nextDueDate ?? null,
          region: regionDisplay(unit, unit.region),
          version: f?.version ?? unit.version,
        })
      }
      if (items.length) items.forEach(append)
      else append(null)
    }
  }
  rows.sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }))
  const groups = Object.entries(
    rows.reduce<Record<string, number>>((groups, r) => {
      groups[r.status] = (groups[r.status] ?? 0) + 1
      return groups
    }, {}),
  ).map(([name, value]) => ({ name, value }))
  const averages =
    kind === "approvals"
      ? ["PENDING", "APPROVED", "REJECTED"].map((status) => {
          const sample = rows.filter((r) => r.stateCode === status && typeof r.hours === "number")
          return {
            name: taskLabels[status],
            samples: sample.length,
            hours: sample.length
              ? Math.round(
                  (sample.reduce((n, r) => n + Number(r.hours), 0) / sample.length) * 100,
                ) / 100
              : null,
          }
        })
      : []
  const stable = rows.map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => k !== "hours")),
  )
  const digest = fingerprint({
    kind,
    q,
    referenceTime: kind === "approvals" || kind === "resources" ? reference.toISOString() : null,
    scope: {
      id: actor.user.id,
      permissions: [...actor.profile.permissions].sort(),
      orgs: [...actor.orgIds].sort(),
      position: actor.user.positionCode,
      team: actor.profile.teamId,
    },
    rows: stable,
    details,
    version: "b5-v1",
  })
  if (input.fingerprint && input.fingerprint !== digest)
    throw AppError.conflict("数据或权限已变化，请刷新报表后重试")
  return {
    kind,
    options: {
      owners: [
        ...new Map(
          rows
            .filter((r) => typeof r.ownerId === "number")
            .map((r) => [r.ownerId, { id: Number(r.ownerId), name: String(r.ownerName) }]),
        ).values(),
      ],
      indicators: [
        ...new Map(
          rows
            .filter((r) => typeof r.indicatorId === "number")
            .map((r) => [
              r.indicatorId,
              { id: Number(r.indicatorId), name: String(r.indicatorName) },
            ]),
        ).values(),
      ],
    },
    title: reportLabels[kind],
    columns,
    rows,
    details,
    groups,
    averages,
    meta: {
      filters: q,
      referenceTime: reference.toISOString(),
      generatedAt: now.toISOString(),
      fingerprint: digest,
      basis,
      version: "b5-v1",
      total: rows.length,
    },
  }
}
