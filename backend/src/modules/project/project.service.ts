import * as s from "@/db/schema"
import { sortRows } from "@/utils/list-sort"
import { assertVersion, requirePermission, teamFor, type Actor } from "@/utils/authorization"
import {
  assertBusinessAccess,
  canConfigureProjects,
  canMaintainProject,
} from "@/utils/business-scope"
import { businessAudit } from "@/utils/business-audit"
import { decimalUnits, decimalText } from "@/utils/decimal"
import { AppError } from "@/utils/errors"
import {
  serviceFields,
  subFields,
  brands,
  canSupervise,
} from "@/modules/identity/identity.constants"
import {
  projectRepository,
  type ProjectRepository,
  type BusinessState,
  type BusinessConnection,
} from "./project.repository"
import {
  pageResult,
  type BusinessQuery,
  type ProjectInput,
  type ContractInput,
  type IndicatorInput,
  type AllocationInput,
} from "./project.validation"
export type Project = typeof s.projects.$inferSelect
/** 获取未删除项目；写入还需显式校验责任和完整统计范围。 */
export function findProject(data: BusinessState, id: number): Project {
  const p = data.projects.find((p) => p.id === id && !p.deletedAt)
  if (!p) throw AppError.notFound()
  return p
}
/** 当前账号能访问的承担团队，SELF 仅保留自己负责的团队上下文。 */
export function visibleTeams(data: BusinessState, actor: Actor, projectId: number) {
  const project = data.projects.find((p) => p.id === projectId)
  const full = !!project && canMaintainProject(actor, project)
  return data.teams.filter(
    (t) =>
      t.projectId === projectId &&
      (full ||
        (t.teamId === actor.profile.teamId &&
          data.members.some(
            (m) => m.projectId === projectId && m.teamId === t.teamId && m.userId === actor.user.id,
          ))),
  )
}
/** 只有开发全局查看或明确负责本项目的管理人员取得完整项目范围。 */
export function fullProject(_data: BusinessState, actor: Actor, p: Project) {
  return canMaintainProject(actor, p)
}
/** 项目写操作统一检查管理岗位、动作权限及项目负责关系。 */
export function manageProject(
  data: BusinessState,
  actor: Actor,
  id: number,
  permission: string,
): Project {
  requirePermission(actor, permission)
  const p = findProject(data, id)
  assertBusinessAccess(canMaintainProject(actor, p), "仅高级主任及以上且负责本项目的人员可维护")
  return p
}
/** 在嵌套资源更新后递增项目版本，避免旧详情覆盖已改变的配置。 */
export async function bumpProject(tx: BusinessConnection, p: Project) {
  await tx.projects.update(p.id, { version: p.version + 1 })
}
/** 输出项目详情时再裁剪团队及合同目标，防止从总量推算其他团队。 */
export function projectDto(data: BusinessState, actor: Actor, p: Project) {
  const teams = visibleTeams(data, actor, p.id),
    full = fullProject(data, actor, p)
  return {
    ...p,
    // 只返回已授权项目关联的显示名称，详情无需读取编辑候选或人员管理接口。
    ownerOrgName: data.identity.orgs.find((o) => o.id === p.ownerOrgId)?.name ?? null,
    directorName: data.identity.users.find((u) => u.id === p.directorId)?.name ?? null,
    canManage: canMaintainProject(actor, p),
    seniorDirectorName: data.identity.users.find((u) => u.id === p.seniorDirectorId)?.name ?? null,
    members: data.members
      .filter((m) => m.projectId === p.id && (full || m.teamId === actor.profile.teamId))
      .map((m) => ({
        ...m,
        name: data.identity.users.find((u) => u.id === m.userId)?.name,
        teamName: data.identity.orgs.find((o) => o.id === m.teamId)?.name,
      })),
    supervisorName: data.identity.users.find((u) => u.id === p.supervisorId)?.name ?? null,
    statisticsScope: full ? "PROJECT" : "TEAM",
    visibleTeamIds: teams.map((t) => t.teamId),
    contract: (() => {
      const c = data.contracts.find((c) => c.projectId === p.id)
      if (!c) return null
      return full ? c : { ...c, amount: undefined, note: undefined }
    })(),
    teams: teams.map((t) => ({
      ...t,
      teamName: data.identity.orgs.find((o) => o.id === t.teamId)?.name,
      reporterName: data.identity.users.find((u) => u.id === t.reporterId)?.name,
    })),
    servicePoints: data.points.filter((t) => t.projectId === p.id && !t.deletedAt),
    indicators: data.indicators
      .filter(
        (i) =>
          i.projectId === p.id &&
          !i.deletedAt &&
          actor.profile.permissions.includes("service:indicator:view"),
      )
      .map((i) => {
        const { targetValue, ...safe } = i
        return {
          ...safe,
          ...(full ? { targetValue } : {}),
          allocations: data.targets.filter(
            (t) => t.indicatorId === i.id && teams.some((team) => team.teamId === t.teamId),
          ),
        }
      }),
  }
}
/** 项目、合同、团队及指标的业务规则，数据库读写交给仓储及同一事务连接。 */
export class ProjectService {
  constructor(readonly repository: ProjectRepository = projectRepository) {}
  /** 分页项目列表，范围由仓储 SQL 过滤，筛选只进一步收窄结果。 */
  list(actor: Actor, query: BusinessQuery) {
    requirePermission(actor, "project:record:view")
    return this.repository.read(actor, (data) => {
      const current = data.actor!
      requirePermission(current, "project:record:view")
      if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo)
        throw AppError.badRequest("合同筛选开始日期不得晚于结束日期")
      const rows = data.projects
        .filter((p) => {
          const c = data.contracts.find((c) => c.projectId === p.id)
          return (
            (!query.keyword || `${p.code} ${p.name}`.includes(query.keyword)) &&
            (!query.category || p.category === query.category) &&
            (!query.status || p.status === query.status) &&
            (!query.serviceFieldCode || p.serviceFieldCode === query.serviceFieldCode) &&
            (!query.teamId ||
              visibleTeams(data, current, p.id).some((t) => t.teamId === query.teamId)) &&
            (!query.serviceArea || c?.serviceArea === query.serviceArea) &&
            (!query.dateFrom || (!!c && c.endDate >= query.dateFrom)) &&
            (!query.dateTo || (!!c && c.startDate <= query.dateTo))
          )
        })
        .map((p) => projectDto(data, current, p))
      return pageResult(
        sortRows(
          rows,
          query,
          {
            id: (r) => r.id,
            code: (r) => r.code,
            name: (r) => r.name,
            createdAt: (r) => r.createdAt,
            startDate: (r) => r.contract?.startDate,
            endDate: (r) => r.contract?.endDate,
          },
          [
            ["createdAt", "desc"],
            ["id", "desc"],
          ],
        ),
        query,
      )
    })
  }
  /** 读取项目及其可见关联配置。 */
  detail(actor: Actor, id: number) {
    requirePermission(actor, "project:record:view")
    return this.repository.read(actor, (data) =>
      projectDto(data, data.actor!, findProject(data, id)),
    )
  }
  /** 候选只暴露合格组织、团队与人员，业务表单不依赖系统人员管理权限。 */
  candidates(actor: Actor, projectId?: number, kind = "configuration", teamId?: number) {
    return this.repository.read(actor, (data) => {
      const current = data.actor!
      if (kind === "filters") {
        const permission = [
          "project:record:view",
          "service:indicator:view",
          "service:monthly:view",
          "analysis:report:view",
        ].find((p) => current.profile.permissions.includes(p))
        if (!permission) throw AppError.forbidden()
        requirePermission(current, permission)
        const ids = new Set(
          data.projects.flatMap((p) => visibleTeams(data, current, p.id).map((t) => t.teamId)),
        )
        return {
          organizations: data.identity.orgs
            .filter((o) => ids.has(o.id))
            .map((o) => ({ id: o.id, name: o.name, type: o.type })),
          users: [],
          serviceFields,
          subFields,
          brands,
          serviceAreas: [...new Set(data.contracts.map((c) => c.serviceArea))].sort(),
          projects: data.projects.map((p) => ({ id: p.id, name: p.name })),
        }
      }
      if (projectId) manageProject(data, current, projectId, "project:record:update")
      else {
        requirePermission(current, "project:record:create")
        assertBusinessAccess(canConfigureProjects(current), "仅高级主任及以上可登记项目")
      }
      const allowedOrg = (_id: number) => canConfigureProjects(current)
      const orgs = data.identity.orgs.filter((o) => o.status === "ACTIVE" && allowedOrg(o.id))
      return {
        organizations: (kind === "users"
          ? []
          : orgs.filter((o) => kind !== "teams" || o.type === "TEAM")
        ).map((o) => ({ id: o.id, name: o.name, type: o.type })),
        users: data.identity.users
          .filter(
            (u) =>
              kind !== "teams" &&
              kind !== "organizations" &&
              u.status === "ACTIVE" &&
              u.orgId !== null &&
              allowedOrg(u.orgId) &&
              (!teamId || teamFor(data.identity.orgs, u.orgId)?.id === teamId),
          )
          .map((u) => ({
            id: u.id,
            name: u.name,
            username: u.username,
            teamId: teamFor(data.identity.orgs, u.orgId)?.id ?? null,
            positionCode: u.positionCode,
            isSupervisor: u.isSupervisor,
          })),
        serviceFields,
        subFields,
        brands,
      }
    })
  }
  /** 登记草稿并校验归属和负责人，唯一编码冲突保留原数据。 */
  create(actor: Actor, input: ProjectInput) {
    return this.repository.write(actor, async (tx, data, current) => {
      requirePermission(current, "project:record:create")
      assertBusinessAccess(canConfigureProjects(current), "仅高级主任及以上可登记项目")
      assertBusinessAccess(
        !!current.profile.isDevSuperadmin ||
          [input.directorId, input.seniorDirectorId, input.supervisorId].includes(current.user.id),
        "请将本人填写为项目负责人员",
      )
      this.validatePeople(data, current, input)
      if (data.projects.some((p) => p.code.toLowerCase() === input.code.toLowerCase()))
        throw AppError.conflict("项目编码已存在")
      const [result] = await tx.projects.insert({ ...input, createdBy: current.user.id })
      await businessAudit(
        tx,
        current.user.id,
        "create-project",
        "project",
        result.insertId,
        null,
        input,
      )
      return { id: result.insertId }
    })
  }
  /** 更新项目基础资料，关联团队不随基础资料变更而丢失。 */
  update(actor: Actor, id: number, input: ProjectInput, version: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      const p = manageProject(data, current, id, "project:record:update")
      assertVersion(p.version, version)
      this.validatePeople(data, current, input)
      if (
        data.projects.some(
          (other) => other.id !== id && other.code.toLowerCase() === input.code.toLowerCase(),
        )
      )
        throw AppError.conflict("项目编码已存在")
      await tx.projects.update(id, { ...input, version: p.version + 1 })
      await businessAudit(tx, current.user.id, "update-project", "project", id, p, input)
      return { id }
    })
  }
  /** 启用或删除项目；启用要求合同与承担团队均有效。 */
  state(actor: Actor, id: number, version: number, operation: "activate" | "delete") {
    return this.repository.write(actor, async (tx, data, current) => {
      const p = manageProject(
        data,
        current,
        id,
        operation === "delete" ? "project:record:delete" : "project:record:update",
      )
      assertVersion(p.version, version)
      const indicators = data.indicators.filter((i) => i.projectId === id),
        reports = data.reports.filter((r) => indicators.some((i) => i.id === r.indicatorId))
      if (operation === "delete") {
        if (
          p.status !== "DRAFT" ||
          reports.some(
            (r) =>
              r.submittedAt ||
              r.status === "IN_REVIEW" ||
              data.instances.some(
                (i) => i.businessType === "SERVICE_SUBMISSION" && i.businessId === r.id,
              ),
          ) ||
          data.changes.some((c) => reports.some((r) => r.id === c.reportId))
        )
          throw AppError.conflict("只允许删除无提交及审批历史的草稿项目")
        await tx.projects.update(id, { deletedAt: new Date(), version: p.version + 1 })
      } else {
        const c = data.contracts.find((c) => c.projectId === id),
          teams = data.teams.filter((t) => t.projectId === id)
        if (!c || !teams.length) throw AppError.conflict("启用前请补齐合同和承担团队")
        this.validateTeams(data, teams)
        await tx.projects.update(id, { status: "ACTIVE", version: p.version + 1 })
      }
      await businessAudit(tx, current.user.id, `${operation}-project`, "project", id, p, {
        operation,
      })
      return { id }
    })
  }
  /** 合同日期出现月报后锁定，其余合同资料仍按版本维护。 */
  contract(actor: Actor, id: number, input: ContractInput, version: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      const p = manageProject(data, current, id, "project:record:update")
      assertVersion(p.version, version)
      if (input.endDate < input.startDate) throw AppError.badRequest("合同结束日期不得早于开始日期")
      decimalUnits(input.amount, false, 12)
      const old = data.contracts.find((c) => c.projectId === id)
      if (
        old &&
        (old.startDate !== input.startDate || old.endDate !== input.endDate) &&
        data.reports.some((r) =>
          data.indicators.some((i) => i.id === r.indicatorId && i.projectId === id),
        )
      )
        throw AppError.conflict("已有月报，合同起止日期已锁定")
      if (
        data.members.some(
          (m) => m.projectId === id && (m.startDate < input.startDate || m.endDate > input.endDate),
        )
      )
        throw AppError.conflict("请先将成员有效期间调整至新的合同周期内")
      if (old) await tx.projectContracts.update(old.id, { ...input, version: old.version + 1 })
      else await tx.projectContracts.insert({ ...input, projectId: id })
      await bumpProject(tx, p)
      await businessAudit(tx, current.user.id, "save-contract", "project", id, old ?? null, input)
      return { id }
    })
  }
  /** 整体保存承担团队，有目标或月报引用的关系不可移除。 */
  teams(
    actor: Actor,
    id: number,
    teams: Array<{ teamId: number; reporterId: number }>,
    version: number,
  ) {
    return this.repository.write(actor, async (tx, data, current) => {
      const p = manageProject(data, current, id, "project:record:update")
      assertVersion(p.version, version)
      this.validateTeams(data, teams)
      if (p.status === "ACTIVE" && !teams.length)
        throw AppError.conflict("启用项目至少保留一个团队")

      const old = data.teams.filter((t) => t.projectId === id)
      for (const row of old.filter((t) => !teams.some((next) => next.teamId === t.teamId))) {
        if (
          data.members.some((m) => m.projectId === id && m.teamId === row.teamId) ||
          data.targets.some(
            (target) =>
              target.teamId === row.teamId &&
              data.indicators.some((i) => i.id === target.indicatorId && i.projectId === id),
          )
        )
          throw AppError.conflict("团队已有指标目标，不能移除")
        await tx.projectTeams.remove(row.id)
      }
      for (const t of teams) {
        const existing = old.find((o) => o.teamId === t.teamId)
        if (existing)
          await tx.projectTeams.update(existing.id, {
            reporterId: t.reporterId,
            version: existing.version + 1,
          })
        else await tx.projectTeams.insert({ ...t, projectId: id })
      }
      await bumpProject(tx, p)
      await businessAudit(tx, current.user.id, "save-project-teams", "project", id, old, teams)
      return { id }
    })
  }
  /** 服务点按 ID 维护，移除采用逻辑删除，保留历史主键。 */
  points(
    actor: Actor,
    id: number,
    points: Array<{ id?: number; name: string; address?: string; note?: string }>,
    version: number,
  ) {
    return this.repository.write(actor, async (tx, data, current) => {
      const p = manageProject(data, current, id, "project:record:update")
      assertVersion(p.version, version)
      const old = data.points.filter((o) => o.projectId === id && !o.deletedAt)
      if (
        new Set(points.filter((p) => p.id).map((p) => p.id)).size !==
        points.filter((p) => p.id).length
      )
        throw AppError.badRequest("服务点重复")
      for (const row of old.filter((o) => !points.some((p) => p.id === o.id)))
        await tx.projectServicePoints.update(row.id, {
          deletedAt: new Date(),
          version: row.version + 1,
        })
      for (const point of points) {
        if (point.id) {
          const row = old.find((o) => o.id === point.id)
          if (!row) throw AppError.badRequest("服务点不属于本项目")
          await tx.projectServicePoints.update(row.id, { ...point, version: row.version + 1 })
        } else await tx.projectServicePoints.insert({ ...point, projectId: id })
      }
      await bumpProject(tx, p)
      await businessAudit(tx, current.user.id, "save-service-points", "project", id, old, points)
      return { id }
    })
  }
  /** 创建或更新草稿指标；提交过的指标单位与口径锁定，启用目标须整体调整。 */
  indicator(actor: Actor, projectId: number, input: IndicatorInput, id?: number, version?: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      manageProject(data, current, projectId, "service:indicator:manage")
      decimalUnits(input.targetValue, true)
      const old = id
        ? data.indicators.find((i) => i.id === id && i.projectId === projectId && !i.deletedAt)
        : undefined
      if (id && !old) throw AppError.notFound()
      if (old) {
        assertVersion(old.version, version!)
        if (
          old.status === "ACTIVE" &&
          old.targetValue !== decimalText(decimalUnits(input.targetValue))
        )
          throw AppError.conflict("启用指标请通过调整目标方案修改目标")
        if (
          data.reports.some((r) => r.indicatorId === id && r.submittedAt) &&
          (old.unit !== input.unit || old.definition !== input.definition)
        )
          throw AppError.conflict("已提交指标的单位和统计口径已锁定")
        await tx.projectIndicators.update(id!, { ...input, version: old.version + 1 })
      } else {
        const [result] = await tx.projectIndicators.insert({ ...input, projectId })
        id = result.insertId
      }
      await businessAudit(
        tx,
        current.user.id,
        "save-indicator",
        "indicator",
        id!,
        old ?? null,
        input,
      )
      return { id: id! }
    })
  }
  /** 分配或原子调整完整目标方案，历史月报引用的团队目标不得移除。 */
  allocations(
    actor: Actor,
    projectId: number,
    id: number,
    targets: AllocationInput,
    version: number,
    newTarget?: string,
    reason?: string,
  ) {
    return this.repository.write(actor, async (tx, data, current) => {
      manageProject(data, current, projectId, "service:indicator:allocate")
      const indicator = data.indicators.find(
        (i) => i.id === id && i.projectId === projectId && !i.deletedAt,
      )
      if (!indicator) throw AppError.notFound()
      assertVersion(indicator.version, version)
      const active = indicator.status === "ACTIVE"
      if (active && (!newTarget || !reason?.trim()))
        throw AppError.badRequest("调整启用指标须提供合同目标和原因")
      const target = newTarget ?? indicator.targetValue
      decimalUnits(target, true)
      if (new Set(targets.map((t) => t.teamId)).size !== targets.length)
        throw AppError.badRequest("团队不能重复")
      for (const t of targets) {
        decimalUnits(t.targetValue, true)
        if (!data.teams.some((team) => team.projectId === projectId && team.teamId === t.teamId))
          throw AppError.badRequest("分配团队不属于项目")
      }
      if (
        active &&
        targets.reduce((sum, t) => sum + decimalUnits(t.targetValue), 0n) !== decimalUnits(target)
      )
        throw AppError.conflict("团队目标总和须等于合同目标")
      const old = data.targets.filter((t) => t.indicatorId === id)
      for (const row of old.filter((o) => !targets.some((t) => t.teamId === o.teamId))) {
        if (data.reports.some((r) => r.indicatorId === id && r.teamId === row.teamId))
          throw AppError.conflict("已有月报的团队目标不可移除")
        await tx.teamIndicatorTargets.remove(row.id)
      }
      for (const t of targets) {
        const row = old.find((o) => o.teamId === t.teamId)
        if (row)
          await tx.teamIndicatorTargets.update(row.id, {
            targetValue: t.targetValue,
            version: row.version + 1,
          })
        else await tx.teamIndicatorTargets.insert({ ...t, indicatorId: id })
      }
      await tx.projectIndicators.update(id, { targetValue: target, version: indicator.version + 1 })
      await businessAudit(
        tx,
        current.user.id,
        "allocate-indicator",
        "indicator",
        id,
        { indicator, targets: old },
        { targetValue: target, targets, reason },
      )
      return { id }
    })
  }
  /** 指标启用校验精确分配总和；删除仅允许无月报的草稿指标。 */
  indicatorState(
    actor: Actor,
    projectId: number,
    id: number,
    version: number,
    operation: "activate" | "delete",
  ) {
    return this.repository.write(actor, async (tx, data, current) => {
      const p = manageProject(data, current, projectId, "service:indicator:manage"),
        i = data.indicators.find((i) => i.id === id && i.projectId === projectId && !i.deletedAt)
      if (!i) throw AppError.notFound()
      assertVersion(i.version, version)
      const targets = data.targets.filter((t) => t.indicatorId === id)
      if (operation === "delete") {
        if (i.status !== "DRAFT" || data.reports.some((r) => r.indicatorId === id))
          throw AppError.conflict("只能删除无月报的草稿指标")
        await tx.projectIndicators.update(id, { deletedAt: new Date(), version: i.version + 1 })
      } else {
        if (
          p.status !== "ACTIVE" ||
          !targets.length ||
          targets.reduce((sum, t) => sum + decimalUnits(t.targetValue), 0n) !==
            decimalUnits(i.targetValue, true)
        )
          throw AppError.conflict("项目须启用且团队目标总和须等于合同目标")
        this.validateTeams(
          data,
          data.teams.filter(
            (team) =>
              team.projectId === projectId &&
              targets.some((target) => target.teamId === team.teamId),
          ),
        )
        await tx.projectIndicators.update(id, { status: "ACTIVE", version: i.version + 1 })
      }
      await businessAudit(tx, current.user.id, `${operation}-indicator`, "indicator", id, i, {
        operation,
      })
      return { id }
    })
  }
  /** 校验负责人及组织资格，防止任意关联跨范围人员。 */
  private validatePeople(data: BusinessState, _actor: Actor, input: ProjectInput) {
    if (!data.identity.orgs.some((o) => o.id === input.ownerOrgId && o.status === "ACTIVE"))
      throw AppError.badRequest("请选择启用组织")
    for (const id of [input.directorId, input.seniorDirectorId]) {
      const u = data.identity.users.find((u) => u.id === id && u.status === "ACTIVE")
      if (!u || !canSupervise(u.positionCode))
        throw AppError.badRequest("项目总监和高级主任须为合格的启用管理人员")
    }
    if (input.supervisorId !== null) {
      const u = data.identity.users.find(
        (u) => u.id === input.supervisorId && u.status === "ACTIVE",
      )
      if (!u?.isSupervisor || !canSupervise(u.positionCode))
        throw AppError.badRequest("请选择具有督导身份的启用管理人员")
    }
    for (const [values, dictionary, label] of [
      [input.subFieldCodes ?? [], subFields, "细分领域"],
      [input.brandCodes ?? [], brands, "品牌归属"],
    ] as const) {
      if (
        new Set(values).size !== values.length ||
        values.some((v) => !dictionary.some((d) => d.code === v))
      )
        throw AppError.badRequest(`${label}不合法或重复`)
    }
    if (!serviceFields.some((f) => f.code === input.serviceFieldCode))
      throw AppError.badRequest("服务领域不合法")
  }
  /** 服务成员调整与重叠校验在锁定身份和业务记录的同一事务执行。 */
  members(
    actor: Actor,
    id: number,
    members: Array<{ userId: number; teamId: number; startDate: string; endDate: string }>,
    version: number,
  ) {
    return this.repository.write(actor, async (tx, data, current) => {
      const p = manageProject(data, current, id, "project:record:update")
      assertVersion(p.version, version)
      const contract = data.contracts.find((c) => c.projectId === id)
      if (!contract) throw AppError.conflict("请先保存合同资料")
      if (new Set(members.map((m) => m.userId)).size !== members.length)
        throw AppError.badRequest("项目成员重复")
      for (const m of members) {
        const u = data.identity.users.find((u) => u.id === m.userId && u.status === "ACTIVE")
        if (
          !u ||
          teamFor(data.identity.orgs, u.orgId)?.id !== m.teamId ||
          !data.teams.some((t) => t.projectId === id && t.teamId === m.teamId)
        )
          throw AppError.badRequest("成员须属于本项目服务团队")
        if (
          m.startDate > m.endDate ||
          m.startDate < contract.startDate ||
          m.endDate > contract.endDate
        )
          throw AppError.badRequest("成员有效期间须处于合同周期内")
        if (
          !canSupervise(u.positionCode) &&
          data.members.some(
            (other) =>
              other.userId === m.userId &&
              other.projectId !== id &&
              other.startDate <= m.endDate &&
              other.endDate >= m.startDate &&
              data.projects.some((p) => p.id === other.projectId && !p.deletedAt),
          )
        )
          throw AppError.conflict(`${u.name}在该期间已分配其他合同包项目`)
      }
      const old = data.members.filter((m) => m.projectId === id)
      for (const m of old)
        if (!members.some((n) => n.userId === m.userId)) await tx.projectMemberships.remove(m.id)
      for (const m of members) {
        const prior = old.find((n) => n.userId === m.userId)
        if (prior)
          await tx.projectMemberships.update(prior.id, { ...m, version: prior.version + 1 })
        else await tx.projectMemberships.insert({ ...m, projectId: id })
      }
      await bumpProject(tx, p)
      await businessAudit(tx, current.user.id, "save-project-members", "project", id, old, members)
      return { id }
    })
  }
  /** 团队须启用且负责人属于该团队，不以岗位名称代替业务关系。 */
  private validateTeams(data: BusinessState, teams: Array<{ teamId: number; reporterId: number }>) {
    if (new Set(teams.map((t) => t.teamId)).size !== teams.length)
      throw AppError.badRequest("团队重复")
    for (const t of teams) {
      const org = data.identity.orgs.find(
          (o) => o.id === t.teamId && o.type === "TEAM" && o.status === "ACTIVE",
        ),
        u = data.identity.users.find((u) => u.id === t.reporterId && u.status === "ACTIVE")
      if (!org || !u || teamFor(data.identity.orgs, u.orgId)?.id !== t.teamId)
        throw AppError.badRequest("请选择启用团队及属于该团队的填报负责人")
    }
  }
}
export const projectService = new ProjectService()
