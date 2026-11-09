import { actorFrom } from "@/modules/identity/identity.service"
import { fingerprint, dateValid } from "@/modules/task/task-calendar"
import { assertVersion, requirePermission, type Actor } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { businessToday } from "@/modules/service/indicator-calculation"
import {
  actualManager,
  canReadFollowup,
  sourceReadable,
  sourceHref,
  eligibleOwners,
} from "./management.authorization"
import {
  ManagementRepository,
  managementRepository,
  type ManagementState,
  type ManagementRow,
} from "./management.repository"
import type {
  ManagementInput,
  ManagementQuery,
  ManagementUpdate,
  ManagementTransition,
} from "./management.validation"
export function followupDto(data: ManagementState, actor: Actor, row: ManagementRow) {
  const canManage = actor.profile.permissions.includes("management:followup:manage")
  return {
    id: row.id,
    projectId: row.projectId,
    teamId: row.teamId,
    title: row.title,
    description: row.description,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    href: sourceHref(row),
    ownerId: row.ownerId,
    ownerName: data.identity.users.find((u) => u.id === row.ownerId)?.name ?? "历史人员",
    projectName: data.projects.find((p) => p.id === row.projectId)?.name ?? "",
    teamName: data.identity.orgs.find((t) => t.id === row.teamId)?.name ?? "项目",
    dueDate: row.dueDate,
    status: row.status,
    result: row.result,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    canManage: canManage && actualManager(data, actor, row.projectId, row.teamId),
    canProcess:
      canManage &&
      row.ownerId === actor.user.id &&
      eligibleOwners(data, row).some((u) => u.id === row.ownerId),
    needsReassignment: !eligibleOwners(data, row).some((u) => u.id === row.ownerId),
    overdue: row.status !== "COMPLETED" && row.dueDate < businessToday(),
  }
}
function validateOwner(data: ManagementState, input: ManagementInput) {
  if (!dateValid(input.dueDate)) throw AppError.badRequest("计划日期无效")
  const u = eligibleOwners(data, input).find((u) => u.id === input.ownerId)
  if (!u || !sourceReadable(data, actorFrom(data.identity, u), input))
    throw AppError.badRequest("负责人无有效资格或无权读取原业务")
}
function find(data: ManagementState, actor: Actor, id: number) {
  const row = data.management.find((r) => r.id === id)
  if (!row || !canReadFollowup(data, actor, row))
    throw AppError.notFound("管理问题不存在或无权访问")
  return row
}
export class ManagementService {
  constructor(readonly repository: ManagementRepository = managementRepository) {}
  list(actor: Actor, q: ManagementQuery) {
    return this.repository.run(actor, false, (data) => {
      const current = data.actor!
      requirePermission(current, "management:followup:view")
      if (q.pageSize && ![10, 20, 50, 100].includes(q.pageSize))
        throw AppError.badRequest("请选择10、20、50或100条")
      if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo) throw AppError.badRequest("日期范围无效")
      const rows = data.management
        .filter(
          (r) =>
            canReadFollowup(data, current, r) &&
            (!q.sourceType || r.sourceType === q.sourceType) &&
            (!q.sourceId || r.sourceId === q.sourceId) &&
            (!q.projectId || r.projectId === q.projectId) &&
            (!q.teamId || r.teamId === q.teamId) &&
            (!q.ownerId || r.ownerId === q.ownerId) &&
            (!q.status || r.status === q.status) &&
            (!q.keyword || r.title.includes(q.keyword.trim())) &&
            (!q.dateFrom || r.dueDate >= q.dateFrom) &&
            (!q.dateTo || r.dueDate <= q.dateTo),
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.id - a.id)
      const page = q.page ?? 1,
        pageSize = q.pageSize ?? 20
      return {
        list: rows
          .slice((page - 1) * pageSize, page * pageSize)
          .map((r) => followupDto(data, current, r)),
        total: rows.length,
        page,
        pageSize,
      }
    })
  }
  candidates(actor: Actor, projectId?: number, teamId?: number) {
    return this.repository.run(actor, false, (data) => {
      const current = data.actor!
      requirePermission(current, "management:followup:manage")
      const projects = data.projects.filter(
        (p) =>
          !p.deletedAt &&
          (actualManager(data, current, p.id, null) ||
            data.teams.some(
              (t) => t.projectId === p.id && actualManager(data, current, p.id, t.teamId),
            )),
      )
      const teams = data.teams
        .filter(
          (t) =>
            projects.some((p) => p.id === t.projectId) &&
            actualManager(data, current, t.projectId, t.teamId),
        )
        .map((t) => ({
          projectId: t.projectId,
          id: t.teamId,
          name: data.identity.orgs.find((o) => o.id === t.teamId)?.name ?? "",
        }))
      const sources: Array<{
        sourceType: ManagementInput["sourceType"]
        sourceId: number
        name: string
        projectId: number
        teamId: number | null
        owners: { id: number; name: string }[]
      }> = []
      const push = (
        type: ManagementInput["sourceType"],
        id: number,
        name: string,
        pid: number,
        tid: number | null,
      ) => {
        const source = { sourceType: type, sourceId: id, projectId: pid, teamId: tid }
        if (
          (projectId && pid !== projectId) ||
          (teamId && tid !== teamId) ||
          !actualManager(data, current, pid, tid) ||
          !sourceReadable(data, current, source)
        )
          return
        const owners = eligibleOwners(data, source)
          .filter((u) => sourceReadable(data, actorFrom(data.identity, u), source))
          .map((u) => ({ id: u.id, name: u.name }))
        sources.push({ ...source, name, owners })
      }
      for (const p of projects) {
        push("PROJECT", p.id, p.name, p.id, null)
        for (const t of teams.filter((t) => t.projectId === p.id))
          push("PROJECT", p.id, `${p.name}／${t.name}`, p.id, t.id)
      }
      for (const t of data.scheduling.tasks) push("TASK", t.id, t.title, t.projectId, t.teamId)
      for (const p of data.scheduling.plans) {
        const t = data.targets.find((t) => t.id === p.targetId)
        if (t) push("PLAN", p.id, `阶段计划第${p.revision}版`, p.projectId, t.teamId)
      }
      for (const i of data.indicators.filter((i) => !i.deletedAt)) {
        push("INDICATOR", i.id, i.name, i.projectId, null)
        for (const t of data.targets.filter((t) => t.indicatorId === i.id))
          push("INDICATOR", i.id, i.name, i.projectId, t.teamId)
      }
      for (const r of data.reports) {
        const i = data.indicators.find((i) => i.id === r.indicatorId)
        if (i) push("RECORD", r.id, `${i.name}／档案${r.id}`, i.projectId, r.teamId)
      }
      return { projects: projects.map((p) => ({ id: p.id, name: p.name })), teams, sources }
    })
  }
  detail(actor: Actor, id: number) {
    return this.repository.run(actor, false, (data) => {
      const current = data.actor!,
        row = find(data, current, id)
      return {
        ...followupDto(data, current, row),
        events: data.managementEvents
          .filter((e) => e.followupId === id)
          .sort((a, b) => a.id - b.id)
          .map((e) => ({
            id: e.id,
            action: e.action,
            note: e.note,
            createdAt: e.createdAt,
            actorName: data.identity.users.find((u) => u.id === e.actorId)?.name ?? "历史人员",
            beforeData: e.beforeData,
            afterData: e.afterData,
          })),
      }
    })
  }
  create(actor: Actor, input: ManagementInput) {
    return this.repository.run(actor, true, async (data, tx) => {
      const current = data.actor!
      requirePermission(current, "management:followup:manage")
      if (
        !actualManager(data, current, input.projectId, input.teamId) ||
        !sourceReadable(data, current, input)
      )
        throw AppError.forbidden("仅实际项目负责人或有效团队主任可分派有权问题")
      const digest = fingerprint(input),
        old = data.management.find(
          (r) => r.createdBy === current.user.id && r.requestKey === input.requestKey,
        )
      if (old) {
        if (old.requestFingerprint !== digest) throw AppError.conflict("请求标识已用于其他内容")
        find(data, current, old.id)
        return { id: old.id }
      }
      validateOwner(data, input)
      const id = await tx.insert({
        ...input,
        createdBy: current.user.id,
        requestFingerprint: digest,
      })
      await tx.event({
        followupId: id,
        actorId: current.user.id,
        action: "CREATE",
        note: input.description,
        afterData: {
          title: input.title,
          ownerId: input.ownerId,
          dueDate: input.dueDate,
          status: "OPEN",
        },
        requestKey: input.requestKey,
        requestFingerprint: digest,
      })
      await tx.audit(current.user.id, "create-management-followup", id, null, {
        title: input.title,
        ownerId: input.ownerId,
      })
      return { id }
    })
  }
  mutate(actor: Actor, id: number, input: ManagementUpdate | ManagementTransition) {
    return this.repository.run(actor, true, async (data, tx) => {
      const current = data.actor!,
        row = find(data, current, id)
      requirePermission(current, "management:followup:manage")
      const manager = actualManager(data, current, row.projectId, row.teamId),
        transition = "action" in input
      if (
        transition
          ? input.action === "REOPEN"
            ? !manager
            : row.ownerId !== current.user.id
          : !manager
      )
        throw AppError.forbidden("请由实际负责人处理，责任和期限变更由项目管理人员维护")
      const digest = fingerprint(input),
        prior = data.managementEvents.find(
          (e) => e.followupId === id && e.requestKey === input.requestKey,
        )
      if (prior) {
        if (prior.actorId !== current.user.id || prior.requestFingerprint !== digest)
          throw AppError.conflict("请求标识已用于其他内容")
        return { id }
      }
      assertVersion(row.version, input.version)
      if (transition && input.action !== "REOPEN")
        validateOwner(data, { ...row, requestKey: input.requestKey })
      const values: Partial<ManagementRow> = { version: row.version + 1 }
      if (transition) {
        if (input.action === "REOPEN") {
          if (row.status !== "COMPLETED") throw AppError.conflict("仅已完成问题可重新打开")
          Object.assign(values, {
            status: "OPEN",
            completedAt: null,
            completedBy: null,
            result: "",
          })
        } else {
          if (row.status === "COMPLETED") throw AppError.conflict("已完成问题须先重新打开")
          if (input.action === "START") {
            if (row.status !== "OPEN") throw AppError.conflict("问题已开始处理")
            values.status = "IN_PROGRESS"
          }
          if (input.action === "COMPLETE")
            Object.assign(values, {
              status: "COMPLETED",
              result: input.note,
              completedAt: new Date(),
              completedBy: current.user.id,
            })
        }
      } else {
        if (row.status === "COMPLETED") throw AppError.conflict("已完成问题须先重新打开")
        validateOwner(data, { ...row, ...input })
        Object.assign(values, {
          title: input.title,
          description: input.description,
          ownerId: input.ownerId,
          dueDate: input.dueDate,
        })
      }
      const before = {
          ownerId: row.ownerId,
          dueDate: row.dueDate,
          status: row.status,
          title: row.title,
          result: row.result,
        },
        after = { ...before, ...values }
      await tx.update(id, values)
      await tx.event({
        followupId: id,
        actorId: current.user.id,
        action: transition ? input.action : "UPDATE",
        note: transition ? input.note : input.reason,
        beforeData: before,
        afterData: after,
        requestKey: input.requestKey,
        requestFingerprint: digest,
      })
      await tx.audit(current.user.id, "update-management-followup", id, before, after)
      return { id }
    })
  }
}
