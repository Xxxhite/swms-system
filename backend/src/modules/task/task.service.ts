import { outcomeTaskState } from "@/modules/outcome/outcome.status"
import {
  projectRepository,
  type ProjectRepository,
  type BusinessState,
  type BusinessConnection,
} from "@/modules/project/project.repository"
import { businessAudit } from "@/utils/business-audit"
import { assertVersion, requirePermission, type Actor } from "@/utils/authorization"
import { decimalText, decimalUnits } from "@/utils/decimal"
import { AppError } from "@/utils/errors"
import { canReadResource } from "@/modules/resource/resource.service"
import { pageResult } from "@/modules/project/project.validation"
import {
  businessDate,
  dateValid,
  fingerprint,
  instant,
  occurrences,
  overlaps,
  type Recurrence,
} from "./task-calendar"
import { taskManage, taskReadable, qualifiedStaff } from "./task.authorization"
import { applicablePlan } from "./plan.service"
import type { TaskInput, BatchInput, TaskQuery } from "./task.validation"

type Task = BusinessState["scheduling"]["tasks"][number]
function findTask(data: BusinessState, actor: Actor, id: number) {
  const t = data.scheduling.tasks.find((t) => t.id === id)
  if (!t || !taskReadable(data, actor, t.projectId, t.teamId)) throw AppError.notFound()
  return t
}
function arranged(
  data: BusinessState,
  actor: Actor,
  input: TaskInput,
  times: { startAt: Date; endAt: Date },
) {
  const { startAt, endAt } = times,
    start = businessDate(startAt),
    end = businessDate(new Date(endAt.getTime() - 1))
  const project = data.projects.find((p) => p.id === input.projectId && !p.deletedAt)
  const contract = data.contracts.find((c) => c.projectId === input.projectId)
  if (
    !project ||
    project.status !== "ACTIVE" ||
    !contract ||
    start < contract.startDate ||
    end > contract.endDate
  )
    throw AppError.conflict("任务须在已启用项目的合同期间内")
  const team = data.identity.orgs.find((o) => o.id === input.teamId && o.status === "ACTIVE")
  if (
    !team ||
    !data.teams.some((t) => t.projectId === input.projectId && t.teamId === input.teamId)
  )
    throw AppError.badRequest("请选择项目中的有效团队")
  const staff = qualifiedStaff(data, input.projectId, input.teamId, start, end)
  if (
    !input.staffIds.includes(input.leaderId) ||
    new Set(input.staffIds).size !== input.staffIds.length ||
    input.staffIds.some((id) => !staff.some((u) => u.id === id))
  )
    throw AppError.conflict("负责人须在工作人员中，所有人员须启用且有效归属覆盖完整任务期间")
  const point = input.pointId
    ? data.points.find(
        (p) => p.id === input.pointId && p.projectId === input.projectId && !p.deletedAt,
      )
    : undefined
  if (input.pointId && !point) throw AppError.badRequest("服务点不存在或不属于该项目")
  if (!input.location.trim()) throw AppError.badRequest("请填写服务地点")
  if (
    (input.kind === "INDICATOR" && !input.indicators.length) ||
    (input.kind === "OTHER" && input.indicators.length)
  )
    throw AppError.badRequest("指标任务须选择指标，指标外任务须清空指标")
  if (
    new Set(input.indicators.map((i) => i.indicatorId)).size !== input.indicators.length ||
    new Set(input.resources.map((r) => r.resourceId)).size !== input.resources.length
  )
    throw AppError.badRequest("指标或资源重复")
  const indicators = input.indicators.map((i) => {
    const indicator = data.indicators.find(
      (r) =>
        r.id === i.indicatorId &&
        r.projectId === input.projectId &&
        !r.deletedAt &&
        r.status === "ACTIVE",
    )
    const target = data.targets.find(
      (t) => t.indicatorId === indicator?.id && t.teamId === input.teamId,
    )
    if (!indicator || !target) throw AppError.badRequest("指标未启用或未分配给该团队")
    const plan = applicablePlan(data, target.id, start)
    if (
      !plan ||
      plan.targetVersion !== target.version ||
      plan.indicatorVersion !== indicator.version
    )
      throw AppError.conflict("请先发布任务日期适用的阶段计划；目标变化后须重新分解")
    const period = data.scheduling.periods.find(
      (p) => p.planId === plan.id && p.startDate <= start && p.endDate >= end,
    )
    if (!period) throw AppError.conflict("任务须完整落在一个计划阶段内，跨阶段请拆分任务")
    return {
      indicatorId: indicator.id,
      targetId: target.id,
      plannedValue: decimalText(decimalUnits(i.plannedValue, true)),
      planId: plan.id,
      periodId: period.id,
    }
  })
  const resources = input.resources.map((r) => {
    requirePermission(actor, "resource:view")
    const resource = data.scheduling.units.find(
      (u) => u.id === r.resourceId && u.status === "ACTIVE" && canReadResource(actor, u),
    )
    if (!resource) throw AppError.notFound("资源已归档、合并或无权使用")
    if (r.contactId) {
      requirePermission(actor, "resource:contact:view")
      if (
        !data.scheduling.contacts.some(
          (c) => c.id === r.contactId && c.resourceId === resource.id && c.status === "ACTIVE",
        )
      )
        throw AppError.badRequest("资源联系人不存在或已归档")
    }
    return {
      resourceId: resource.id,
      contactId: r.contactId ?? null,
      resourceName: resource.name,
      collaboration: r.collaboration.trim(),
    }
  })
  return { times, indicators, resources }
}
function review(
  data: BusinessState,
  actor: Actor,
  input: TaskInput,
  recurrence?: Recurrence,
  excludeId?: number,
) {
  taskManage(
    data,
    actor,
    input.projectId,
    input.teamId,
    excludeId ? "activity:task:update" : "activity:task:create",
  )
  if (excludeId) {
    const old = findTask(data, actor, excludeId)
    if (
      old.status !== "SCHEDULED" ||
      old.projectId !== input.projectId ||
      old.teamId !== input.teamId
    )
      throw AppError.conflict("仅可维护待开展任务，项目和团队须保持原安排")
  }
  const instances = occurrences(input.startAt, input.endAt, recurrence).map((times) =>
    arranged(data, actor, input, times),
  )
  const conflicts: Array<{
    instance: number
    taskId: number | null
    title: string
    staffNames: string[]
    startAt: Date | null
    endAt: Date | null
  }> = []
  const warnings: string[] = []
  const conflictState: unknown[] = []
  for (const [index, item] of instances.entries()) {
    for (const other of data.scheduling.tasks.filter(
      (t) => t.id !== excludeId && t.status !== "CANCELED" && overlaps(t, item.times),
    )) {
      const shared = data.scheduling.staff.filter(
        (s) => s.taskId === other.id && input.staffIds.includes(s.userId),
      )
      if (!shared.length) continue
      const visible =
        actor.profile.permissions.includes("activity:view") &&
        taskReadable(data, actor, other.projectId, other.teamId)
      conflicts.push({
        instance: index,
        taskId: visible ? other.id : null,
        title: visible ? other.title : "人员在其他安排中存在时段冲突",
        staffNames: shared.map(
          (s) => data.identity.users.find((u) => u.id === s.userId)?.name ?? "工作人员",
        ),
        startAt: visible ? other.startAt : null,
        endAt: visible ? other.endAt : null,
      })
      conflictState.push([
        index,
        other.id,
        other.version,
        other.startAt,
        other.endAt,
        shared.map((s) => s.userId),
      ])
    }
    for (let earlier = 0; earlier < index; earlier++)
      if (overlaps(item.times, instances[earlier]!.times)) {
        conflicts.push({
          instance: index,
          taskId: null,
          title: `与本批第${earlier + 1}项时间重叠`,
          staffNames: [],
          ...instances[earlier]!.times,
        })
        conflictState.push([index, earlier])
      }
  }
  const amounts = new Map<number, bigint>()
  for (const instance of instances)
    for (const i of instance.indicators)
      amounts.set(i.periodId, (amounts.get(i.periodId) ?? 0n) + decimalUnits(i.plannedValue))
  for (const [periodId, amount] of amounts) {
    const period = data.scheduling.periods.find((p) => p.id === periodId)!
    const previous = data.scheduling.indicators
      .filter(
        (i) =>
          i.targetId === data.scheduling.plans.find((p) => p.id === period.planId)!.targetId &&
          i.taskId !== excludeId &&
          data.scheduling.tasks.some(
            (t) =>
              t.id === i.taskId &&
              t.status !== "CANCELED" &&
              businessDate(t.startAt) >= period.startDate &&
              businessDate(t.startAt) <= period.endDate,
          ),
      )
      .reduce((sum, i) => sum + decimalUnits(i.plannedValue), 0n)
    if (amount + previous > decimalUnits(period.targetValue))
      warnings.push(
        `阶段${period.startDate}至${period.endDate}安排合计${decimalText(amount + previous)}，超过目标${period.targetValue}`,
      )
  }
  const token = fingerprint({ input, recurrence, excludeId, conflictState, warnings, instances })
  return { instances, conflicts, warnings, previewToken: token }
}
function confirm(
  result: ReturnType<typeof review>,
  input: { previewToken?: string; conflictReason?: string },
) {
  if (
    (result.conflicts.length || result.warnings.length) &&
    (input.previewToken !== result.previewToken || !input.conflictReason?.trim())
  )
    throw AppError.conflict("安排存在冲突或超量，请重新预览并填写处理说明后确认")
}
function snapshot(data: BusinessState, t: Task) {
  return {
    ...t,
    staffIds: data.scheduling.staff.filter((s) => s.taskId === t.id).map((s) => s.userId),
    indicators: data.scheduling.indicators.filter((i) => i.taskId === t.id),
    resources: data.scheduling.resources.filter((r) => r.taskId === t.id),
  }
}
async function children(
  tx: BusinessConnection,
  id: number,
  input: TaskInput,
  item: ReturnType<typeof arranged>,
) {
  await tx.scheduling.staff.clear(id)
  await tx.scheduling.indicators.clear(id)
  await tx.scheduling.resources.clear(id)
  for (const userId of input.staffIds) await tx.scheduling.staff.insert({ taskId: id, userId })
  for (const i of item.indicators) await tx.scheduling.indicators.insert({ ...i, taskId: id })
  for (const r of item.resources) await tx.scheduling.resources.insert({ ...r, taskId: id })
}
function values(input: TaskInput, times: { startAt: Date; endAt: Date }) {
  return {
    projectId: input.projectId,
    teamId: input.teamId,
    title: input.title.trim(),
    form: input.form,
    kind: input.kind,
    pointId: input.pointId ?? null,
    location: input.location.trim(),
    address: input.address.trim(),
    ...times,
    leaderId: input.leaderId,
    expectedPeople: input.expectedPeople,
    description: input.description.trim(),
    evidence: input.evidence.trim(),
  }
}
function eventSnapshot(data: BusinessState, value: unknown) {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const resources = Array.isArray(row.resources)
    ? row.resources.map((r) => {
        const x = r as Record<string, unknown>
        return { resourceName: x.resourceName, collaboration: x.collaboration }
      })
    : undefined
  return {
    title: row.title,
    startAt: row.startAt,
    endAt: row.endAt,
    location: row.location,
    address: row.address,
    leaderName: data.identity.users.find((u) => u.id === row.leaderId)?.name,
    staffNames: Array.isArray(row.staffIds)
      ? row.staffIds.map((id) => data.identity.users.find((u) => u.id === id)?.name ?? "历史人员")
      : undefined,
    indicators: Array.isArray(row.indicators)
      ? row.indicators.map((i) => {
          const item = i as Record<string, unknown>
          return {
            indicatorName: data.indicators.find((x) => x.id === item.indicatorId)?.name,
            plannedValue: item.plannedValue,
          }
        })
      : undefined,
    resources,
    status: row.status,
    conflictReason: row.conflictReason,
  }
}
function taskDto(data: BusinessState, actor: Actor, t: Task) {
  const execution = data.executions.sessions.find((e) => e.taskId === t.id)

  const staffRows = data.scheduling.staff.filter((s) => s.taskId === t.id)
  const eligible = qualifiedStaff(
    data,
    t.projectId,
    t.teamId,
    businessDate(t.startAt),
    businessDate(new Date(t.endAt.getTime() - 1)),
  )
  const needsRearrangement =
    t.status === "SCHEDULED" &&
    t.endAt > new Date() &&
    staffRows.some((s) => !eligible.some((u) => u.id === s.userId))
  const resources = data.scheduling.resources
    .filter((r) => r.taskId === t.id)
    .map((r) => {
      const unit = data.scheduling.units.find((u) => u.id === r.resourceId)
      const visible =
        !!unit &&
        actor.profile.permissions.includes("resource:view") &&
        canReadResource(actor, unit)
      const contact =
        visible && actor.profile.permissions.includes("resource:contact:view")
          ? data.scheduling.contacts.find(
              (c) => c.id === r.contactId && c.resourceId === r.resourceId,
            )
          : undefined
      return {
        id: r.id,
        resourceId: visible ? r.resourceId : null,
        resourceName: r.resourceName,
        collaboration: r.collaboration,
        needsReview:
          unit?.status !== "ACTIVE" ||
          (!!r.contactId &&
            !data.scheduling.contacts.some(
              (c) => c.id === r.contactId && c.resourceId === r.resourceId && c.status === "ACTIVE",
            )),
        contactId: contact?.id ?? null,
        contact: contact
          ? {
              name: contact.name,
              phone: contact.phone,
              email: contact.email,
              status: contact.status,
            }
          : null,
      }
    })
  const can = (permission: string) => {
    try {
      taskManage(data, actor, t.projectId, t.teamId, permission)
      return t.status === "SCHEDULED" && !execution
    } catch {
      return false
    }
  }
  return {
    ...t,
    requestKey: undefined,
    batchFingerprint: undefined,
    ...outcomeTaskState(data, t.id),
    overdue: outcomeTaskState(data, t.id).state === "SCHEDULED" && t.endAt < new Date(),
    needsRearrangement,
    staffIds: staffRows.map((s) => s.userId),
    staff: staffRows.map((s) => ({
      userId: s.userId,
      name: data.identity.users.find((u) => u.id === s.userId)?.name ?? "历史人员",
    })),
    leaderName: data.identity.users.find((u) => u.id === t.leaderId)?.name,
    projectName: data.projects.find((p) => p.id === t.projectId)?.name,
    teamName: data.identity.orgs.find((o) => o.id === t.teamId)?.name,
    indicators: data.scheduling.indicators
      .filter((i) => i.taskId === t.id)
      .map((i) => ({
        ...i,
        indicatorName: data.indicators.find((x) => x.id === i.indicatorId)?.name,
        unit: data.indicators.find((x) => x.id === i.indicatorId)?.unit,
      })),
    resources,
    canUpdate: can("activity:task:update"),
    canCancel: can("activity:task:cancel"),
  }
}
export class TaskService {
  constructor(readonly repository: ProjectRepository = projectRepository) {}
  list(actor: Actor, query: TaskQuery, calendar = false) {
    return this.repository.read(actor, (data) => {
      const current = data.actor!
      requirePermission(current, "activity:view")
      if (
        (query.from && !dateValid(query.from)) ||
        (query.to && !dateValid(query.to)) ||
        (query.from && query.to && query.from > query.to)
      )
        throw AppError.badRequest("查询日期无效")
      if (
        calendar &&
        (!query.from || !query.to || Date.parse(query.to) - Date.parse(query.from) > 62 * 86400000)
      )
        throw AppError.badRequest("日历须指定不超过63天的显示区间")
      const rows = data.scheduling.tasks
        .filter(
          (t) =>
            taskReadable(data, current, t.projectId, t.teamId) &&
            (!query.projectId || t.projectId === query.projectId) &&
            (!query.teamId || t.teamId === query.teamId) &&
            (!query.leaderId || t.leaderId === query.leaderId) &&
            (!query.keyword || t.title.includes(query.keyword.trim())) &&
            (!query.form || t.form === query.form) &&
            (!query.status || t.status === query.status) &&
            (!query.from || businessDate(new Date(t.endAt.getTime() - 1)) >= query.from) &&
            (!query.to || businessDate(t.startAt) <= query.to) &&
            (query.mine !== "true" ||
              data.scheduling.staff.some((s) => s.taskId === t.id && s.userId === current.user.id)),
        )
        .sort((a, b) => b.startAt.getTime() - a.startAt.getTime() || b.id - a.id)
        .map((t) => taskDto(data, current, t))
      return calendar ? { list: rows, total: rows.length } : pageResult(rows, query)
    })
  }
  detail(actor: Actor, id: number) {
    return this.repository.read(actor, (data) => {
      const current = data.actor!
      requirePermission(current, "activity:view")
      const t = findTask(data, current, id)
      return {
        ...taskDto(data, current, t),
        events: data.scheduling.events
          .filter((e) => e.taskId === id)
          .map((e) => ({
            ...e,
            beforeData: eventSnapshot(data, e.beforeData),
            afterData: eventSnapshot(data, e.afterData),
            actorName: data.identity.users.find((u) => u.id === e.actorId)?.name,
          })),
      }
    })
  }
  preview(actor: Actor, input: TaskInput & { recurrence?: Recurrence; excludeId?: number }) {
    return this.repository.read(actor, (data) => {
      const { recurrence, excludeId, ...fields } = input
      const { instances, ...rest } = review(data, data.actor!, fields, recurrence, excludeId)
      return { ...rest, instances: instances.map((i) => i.times) }
    })
  }
  create(actor: Actor, input: BatchInput, sourceTaskId?: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      taskManage(data, current, input.projectId, input.teamId, "activity:task:create")
      if (sourceTaskId) findTask(data, current, sourceTaskId)
      const { requestKey, previewToken, conflictReason, recurrence, ...taskInput } = input
      const batchFingerprint = fingerprint({ input: taskInput, recurrence, sourceTaskId })
      const previous = data.scheduling.tasks.filter(
        (t) => t.createdBy === current.user.id && t.requestKey === requestKey,
      )
      if (previous.length) {
        if (previous.some((t) => t.batchFingerprint !== batchFingerprint))
          throw AppError.conflict("请求标识已用于其他安排")
        return { id: previous[0]!.id, ids: previous.map((t) => t.id), replayed: true }
      }
      const result = review(data, current, taskInput, recurrence)
      confirm(result, { previewToken, conflictReason })
      const ids: number[] = []
      for (const [index, item] of result.instances.entries()) {
        const v = values(taskInput, item.times)
        const id = await tx.scheduling.tasks.insert({
          ...v,
          createdBy: current.user.id,
          requestKey,
          batchIndex: index,
          batchFingerprint,
          sourceTaskId: sourceTaskId ?? null,
        })
        await children(tx, id, taskInput, item)
        await tx.scheduling.events.insert({
          taskId: id,
          actorId: current.user.id,
          action: sourceTaskId ? "COPY" : "CREATE",
          reason: conflictReason?.trim() || "创建安排",
          afterData: {
            ...v,
            staffIds: taskInput.staffIds,
            indicators: item.indicators,
            resources: item.resources,
            sourceTaskId,
          },
        })
        await businessAudit(tx, current.user.id, "create-service-task", "service-task", id, null, {
          title: v.title,
          projectId: v.projectId,
          teamId: v.teamId,
          sourceTaskId,
        })
        ids.push(id)
      }
      return { id: ids[0]!, ids, replayed: false }
    })
  }
  update(
    actor: Actor,
    id: number,
    input: TaskInput & {
      version: number
      reason: string
      previewToken?: string
      conflictReason?: string
    },
  ) {
    return this.repository.write(actor, async (tx, data, current) => {
      const old = findTask(data, current, id)
      if (data.executions.sessions.some((e) => e.taskId === id))
        throw AppError.conflict("服务已有现场来源，原安排保持不变")
      assertVersion(old.version, input.version)
      const { version, reason, previewToken, conflictReason, ...fields } = input
      void version
      const result = review(data, current, fields, undefined, id)
      confirm(result, { previewToken, conflictReason })
      const item = result.instances[0]!,
        v = values(fields, item.times)
      await tx.scheduling.tasks.update(id, { ...v, version: old.version + 1 })
      await children(tx, id, fields, item)
      await tx.scheduling.events.insert({
        taskId: id,
        actorId: current.user.id,
        action: "UPDATE",
        reason: reason.trim(),
        beforeData: snapshot(data, old),
        afterData: {
          ...v,
          staffIds: fields.staffIds,
          indicators: item.indicators,
          resources: item.resources,
          conflictReason,
        },
      })
      await businessAudit(tx, current.user.id, "update-service-task", "service-task", id, null, {
        reason,
        version: old.version + 1,
      })
      return { id }
    })
  }
  cancel(actor: Actor, id: number, version: number, reason: string) {
    return this.repository.write(actor, async (tx, data, current) => {
      const t = findTask(data, current, id)
      taskManage(data, current, t.projectId, t.teamId, "activity:task:cancel")
      assertVersion(t.version, version)
      if (data.executions.sessions.some((e) => e.taskId === id))
        throw AppError.conflict("已有现场执行，请使用现场中止或后续核验流程")
      if (t.status !== "SCHEDULED") throw AppError.conflict("任务已取消")
      await tx.scheduling.tasks.update(id, { status: "CANCELED", version: t.version + 1 })
      await tx.scheduling.events.insert({
        taskId: id,
        actorId: current.user.id,
        action: "CANCEL",
        reason: reason.trim(),
        beforeData: { status: t.status },
        afterData: { status: "CANCELED", executable: false },
      })
      await businessAudit(tx, current.user.id, "cancel-service-task", "service-task", id, null, {
        reason,
      })
      return { id }
    })
  }
  candidates(
    actor: Actor,
    query: { projectId?: number; teamId?: number; startAt?: string; endAt?: string },
  ) {
    return this.repository.read(actor, (data) => {
      const current = data.actor!
      if (
        !current.profile.permissions.some((p) =>
          [
            "activity:view",
            "activity:task:create",
            "activity:task:update",
            "service:plan:view",
            "service:plan:manage",
          ].includes(p),
        )
      )
        throw AppError.forbidden()
      const teams = data.teams.filter((t) => taskReadable(data, current, t.projectId, t.teamId))
      const selected = teams.filter(
        (t) =>
          (!query.projectId || t.projectId === query.projectId) &&
          (!query.teamId || t.teamId === query.teamId),
      )
      const from = query.startAt ? businessDate(instant(query.startAt)) : businessDate(),
        to = query.endAt ? businessDate(new Date(instant(query.endAt).getTime() - 1)) : from
      const staff =
        query.projectId && query.teamId && selected.length
          ? qualifiedStaff(data, query.projectId, query.teamId, from, to)
          : []
      const targetRows = data.targets.filter((t) =>
        selected.some(
          (team) =>
            team.teamId === t.teamId &&
            data.indicators.some(
              (i) =>
                i.id === t.indicatorId &&
                i.projectId === team.projectId &&
                !i.deletedAt &&
                i.status === "ACTIVE",
            ),
        ),
      )
      const units = current.profile.permissions.includes("resource:view")
        ? data.scheduling.units.filter((u) => u.status === "ACTIVE" && canReadResource(current, u))
        : []
      return {
        projects: data.projects
          .filter((p) => !p.deletedAt && teams.some((t) => t.projectId === p.id))
          .map((p) => ({ id: p.id, name: p.name, status: p.status })),
        teams: teams.map((t) => ({
          projectId: t.projectId,
          teamId: t.teamId,
          name: data.identity.orgs.find((o) => o.id === t.teamId)?.name ?? "团队",
        })),
        staff: staff.map((u) => ({ id: u.id, name: u.name })),
        leaders: data.identity.users
          .filter((u) =>
            data.scheduling.tasks.some(
              (t) => t.leaderId === u.id && taskReadable(data, current, t.projectId, t.teamId),
            ),
          )
          .map((u) => ({ id: u.id, name: u.name })),
        targets: targetRows.map((t) => {
          const i = data.indicators.find((i) => i.id === t.indicatorId)!
          return {
            id: t.id,
            indicatorId: i.id,
            projectId: i.projectId,
            teamId: t.teamId,
            name: i.name,
            unit: i.unit,
            targetValue: t.targetValue,
            plan: applicablePlan(data, t.id, from) ?? null,
            contract: data.contracts
              .filter((c) => c.projectId === i.projectId)
              .map((c) => ({ startDate: c.startDate, endDate: c.endDate }))[0],
          }
        }),
        points: data.points
          .filter((p) => !p.deletedAt && selected.some((t) => t.projectId === p.projectId))
          .map((p) => ({ id: p.id, projectId: p.projectId, name: p.name, address: p.address })),
        resources: units.map((u) => ({
          id: u.id,
          name: u.name,
          contacts: current.profile.permissions.includes("resource:contact:view")
            ? data.scheduling.contacts
                .filter((c) => c.resourceId === u.id && c.status === "ACTIVE")
                .map((c) => ({ id: c.id, name: c.name }))
            : [],
        })),
      }
    })
  }
}
