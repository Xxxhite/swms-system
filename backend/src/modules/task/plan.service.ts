import {
  projectRepository,
  type ProjectRepository,
  type BusinessState,
} from "@/modules/project/project.repository"
import { businessAudit } from "@/utils/business-audit"
import { assertVersion, requirePermission, type Actor } from "@/utils/authorization"
import { decimalText, decimalUnits } from "@/utils/decimal"
import { AppError } from "@/utils/errors"
import { pageResult } from "@/modules/project/project.validation"
import {
  businessDate,
  dateValid,
  monthlyPeriods,
  validatePeriods,
  type PeriodInput,
} from "./task-calendar"
import { taskManage, taskReadable } from "./task.authorization"
import type { PlanInput } from "./plan.validation"
import type { TaskQuery } from "./task.validation"

export function targetContext(data: BusinessState, targetId: number) {
  const target = data.targets.find((t) => t.id === targetId)
  const indicator = data.indicators.find((i) => i.id === target?.indicatorId && !i.deletedAt)
  const contract = data.contracts.find((c) => c.projectId === indicator?.projectId)
  if (!target || !indicator || !contract) throw AppError.notFound("团队指标目标或合同不存在")
  return { target, indicator, contract }
}
export function applicablePlan(data: BusinessState, targetId: number, day: string) {
  return data.scheduling.plans
    .filter((p) => p.targetId === targetId && p.status === "PUBLISHED" && p.effectiveDate <= day)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.revision - a.revision)[0]
}
export function planDto(data: BusinessState, actor: Actor, id: number) {
  const p = data.scheduling.plans.find((p) => p.id === id)
  if (!p) throw AppError.notFound()
  const { target, indicator } = targetContext(data, p.targetId)
  if (!taskReadable(data, actor, p.projectId, target.teamId)) throw AppError.notFound()
  return {
    ...p,
    currentTargetValue: target.targetValue,
    teamId: target.teamId,
    indicatorId: indicator.id,
    indicatorName: indicator.name,
    unit: indicator.unit,
    projectName: data.projects.find((x) => x.id === p.projectId)?.name,
    teamName: data.identity.orgs.find((o) => o.id === target.teamId)?.name,
    stale: p.targetVersion !== target.version || p.indicatorVersion !== indicator.version,
    periods: data.scheduling.periods.filter((r) => r.planId === id),
    canManage: (() => {
      try {
        taskManage(data, actor, p.projectId, target.teamId, "service:plan:manage")
        return true
      } catch {
        return false
      }
    })(),
  }
}
function lockedPeriods(
  data: BusinessState,
  targetId: number,
  effectiveDate: string,
  periods: PeriodInput[],
) {
  const prior = applicablePlan(data, targetId, effectiveDate)
  if (!prior) return
  for (const old of data.scheduling.periods.filter(
    (p) => p.planId === prior.id && p.endDate < effectiveDate,
  )) {
    if (
      !periods.some(
        (p) =>
          p.startDate === old.startDate &&
          p.endDate === old.endDate &&
          decimalUnits(p.targetValue) === decimalUnits(old.targetValue),
      )
    )
      throw AppError.conflict("生效日前已结束的阶段及数量须保持原版")
  }
}
export class PlanService {
  constructor(readonly repository: ProjectRepository = projectRepository) {}
  list(actor: Actor, query: TaskQuery) {
    return this.repository.read(actor, (data) => {
      const current = data.actor!
      requirePermission(current, "service:plan:view")
      const list = data.scheduling.plans
        .filter((p) => {
          const t = data.targets.find((t) => t.id === p.targetId)
          return (
            t &&
            taskReadable(data, current, p.projectId, t.teamId) &&
            (!query.projectId || p.projectId === query.projectId) &&
            (!query.teamId || t.teamId === query.teamId) &&
            (!query.status || p.status === query.status)
          )
        })
        .sort((a, b) => b.id - a.id)
        .map((p) => planDto(data, current, p.id))
      return pageResult(list, query)
    })
  }
  detail(actor: Actor, id: number) {
    return this.repository.read(actor, (data) => {
      requirePermission(data.actor!, "service:plan:view")
      return planDto(data, data.actor!, id)
    })
  }
  save(actor: Actor, input: PlanInput, id?: number, version?: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      const { target, indicator, contract } = targetContext(data, input.targetId)
      const project = taskManage(
        data,
        current,
        indicator.projectId,
        target.teamId,
        "service:plan:manage",
      )
      if (project.status !== "ACTIVE" || indicator.status !== "ACTIVE")
        throw AppError.conflict("请先启用项目及指标")
      if (
        !dateValid(input.effectiveDate) ||
        input.effectiveDate < businessDate() ||
        input.effectiveDate > contract.endDate
      )
        throw AppError.badRequest("生效日须在今天至合同结束日之间")
      const old = id ? data.scheduling.plans.find((p) => p.id === id) : undefined
      if (id && (!old || old.targetId !== input.targetId)) throw AppError.notFound()
      if (old) {
        assertVersion(old.version, version!)
        if (old.status !== "DRAFT") throw AppError.conflict("已发布计划须复制新版本调整")
      }
      const periods =
        input.periods ?? monthlyPeriods(contract.startDate, contract.endDate, target.targetValue)
      validatePeriods(periods, contract.startDate, contract.endDate, target.targetValue)
      if (input.mode === "MONTHLY") {
        const ranges = monthlyPeriods(contract.startDate, contract.endDate, target.targetValue)
        if (
          ranges.length !== periods.length ||
          ranges.some(
            (r, i) => r.startDate !== periods[i]!.startDate || r.endDate !== periods[i]!.endDate,
          )
        )
          throw AppError.badRequest("月度计划须使用合同相交月份区间")
      }
      lockedPeriods(data, target.id, input.effectiveDate, periods)
      const values = {
        projectId: project.id,
        targetId: target.id,
        mode: input.mode,
        effectiveDate: input.effectiveDate,
        targetValue: target.targetValue,
        targetVersion: target.version,
        indicatorVersion: indicator.version,
        reason: input.reason.trim(),
      }
      const planId = old
        ? old.id
        : await tx.scheduling.plans.insert({
            ...values,
            revision:
              Math.max(
                0,
                ...data.scheduling.plans
                  .filter((p) => p.targetId === target.id)
                  .map((p) => p.revision),
              ) + 1,
            createdBy: current.user.id,
          })
      if (old) {
        await tx.scheduling.plans.update(planId, { ...values, version: old.version + 1 })
        await tx.scheduling.periods.clear(planId)
      }
      for (const [sequence, p] of periods.entries())
        await tx.scheduling.periods.insert({
          ...p,
          targetValue: decimalText(decimalUnits(p.targetValue)),
          planId,
          sequence,
        })
      await businessAudit(
        tx,
        current.user.id,
        "save-service-plan",
        "service-plan",
        planId,
        old ?? null,
        { ...values, periods },
      )
      return { id: planId }
    })
  }
  publish(actor: Actor, id: number, version: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      const p = data.scheduling.plans.find((p) => p.id === id)
      if (!p) throw AppError.notFound()
      const { target, indicator, contract } = targetContext(data, p.targetId)
      taskManage(data, current, p.projectId, target.teamId, "service:plan:manage")
      assertVersion(p.version, version)
      if (
        p.status !== "DRAFT" ||
        p.targetVersion !== target.version ||
        p.indicatorVersion !== indicator.version ||
        indicator.status !== "ACTIVE"
      )
        throw AppError.conflict("草稿或团队目标已变化，请复制或重新保存计划")
      if (p.effectiveDate < businessDate() || p.effectiveDate > contract.endDate)
        throw AppError.conflict("生效日已过期或超出合同")
      const periods = data.scheduling.periods.filter((r) => r.planId === id)
      validatePeriods(periods, contract.startDate, contract.endDate, target.targetValue)
      lockedPeriods(data, target.id, p.effectiveDate, periods)
      const latest = applicablePlan(data, target.id, p.effectiveDate)
      if (latest && latest.effectiveDate === p.effectiveDate && latest.revision >= p.revision)
        throw AppError.conflict("已有较新的生效版，请复制最新计划")
      await tx.scheduling.plans.update(id, {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedBy: current.user.id,
        version: p.version + 1,
      })
      await businessAudit(tx, current.user.id, "publish-service-plan", "service-plan", id, null, {
        revision: p.revision,
        effectiveDate: p.effectiveDate,
      })
      return { id }
    })
  }
  async copy(actor: Actor, id: number, effectiveDate: string, reason: string) {
    const p = await this.detail(actor, id)
    const periods = p.periods.map((r) => ({
      startDate: r.startDate,
      endDate: r.endDate,
      targetValue: r.targetValue,
    }))
    if (decimalUnits(p.currentTargetValue) !== decimalUnits(p.targetValue)) {
      const locked = periods.filter((r) => r.endDate < effectiveDate)
      const open = periods.filter((r) => r.endDate >= effectiveDate)
      const remaining =
        decimalUnits(p.currentTargetValue) -
        locked.reduce((sum, r) => sum + decimalUnits(r.targetValue), 0n)
      if (remaining < 0n || !open.length)
        throw AppError.conflict("新目标不足以保留历史阶段，请先核对团队目标")
      const each = remaining / BigInt(open.length)
      open.forEach(
        (r, i) =>
          (r.targetValue = decimalText(
            i === open.length - 1 ? remaining - each * BigInt(i) : each,
          )),
      )
    }
    return this.save(actor, { targetId: p.targetId, mode: p.mode, effectiveDate, reason, periods })
  }
}
