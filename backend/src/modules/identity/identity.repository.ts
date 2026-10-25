import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  lte,
  inArray,
  like,
  or,
  getTableColumns,
  sql,
  type SQL,
} from "drizzle-orm"
import { db } from "@/db"
import * as s from "@/db/schema"
import { safeUser, type Actor, type User } from "@/utils/authorization"
import { canSupervise } from "./identity.constants"
import { AppError } from "@/utils/errors"
import { resolveSort, type SortQuery } from "@/utils/list-sort"

export type Database = typeof db
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
type Connection = Database | Transaction
export type AuthorizationInput = {
  roleIds: number[]
  extraPermissions: string[]
  dataScope: User["dataScope"]
  managedOrgIds: number[]
}
/** 汇总身份关联数据；写事务传 lock=true，让业务校验与后续写入共用锁定后的状态。 */
export async function loadState(connection: Connection, lock = false) {
  // 管理写入按统一顺序锁定身份记录，保证最后管理员、组织循环和审核并发校验一致。
  const orgs = await (lock
    ? connection.select().from(s.organizations).for("update")
    : connection.select().from(s.organizations))
  const roles = await (lock
    ? connection.select().from(s.roles).for("update")
    : connection.select().from(s.roles))
  const users = await (lock
    ? connection.select().from(s.users).for("update")
    : connection.select().from(s.users))
  const permissions = await connection.select().from(s.permissions)
  const rolePermissions = await connection.select().from(s.rolePermissions)
  const userRoles = await connection.select().from(s.userRoles)
  const extras = await connection.select().from(s.userExtraPermissions)
  const managed = await connection.select().from(s.userManagedOrgs)
  return { orgs, roles, users, permissions, rolePermissions, userRoles, extras, managed }
}
export type IdentityState = Awaited<ReturnType<typeof loadState>>
export interface ListQuery extends SortQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
}

/** 使用当前事务追加审计，使业务修改与对应日志一起提交或回滚。 */
async function audit(
  tx: Transaction,
  actorId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  before: unknown,
  after: unknown,
) {
  await tx
    .insert(s.auditLogs)
    .values({ actorId, action, entityType, entityId, beforeData: before, afterData: after })
}
/** 检查驱动错误及其 cause，识别数据库唯一键重复异常。 */
function isDuplicate(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  return (
    ("code" in error && error.code === "ER_DUP_ENTRY") ||
    ("cause" in error && isDuplicate(error.cause))
  )
}
/** 以数据库唯一约束兜住并发重复写入，并将驱动异常转为统一业务冲突。 */
async function unique<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation
  } catch (error) {
    if (isDuplicate(error)) throw AppError.conflict("账号或编码已存在")
    throw error
  }
}

/** 身份仓储：集中处理身份关联数据读取、范围过滤、事务写入和审计持久化。 */
export class IdentityRepository {
  constructor(readonly database: Database = db) {}
  /** 读取组织、人员和授权关系的完整状态，供服务层计算有效身份。 */
  state() {
    return loadState(this.database)
  }
  /** 按人员主键读取原始记录；对外响应的脱敏由调用方负责。 */
  async findUser(id: number) {
    return (await this.database.select().from(s.users).where(eq(s.users.id, id)))[0]
  }
  /** 按唯一账号读取原始记录，主要用于登录及初始化检查。 */
  async findUsername(username: string) {
    return (await this.database.select().from(s.users).where(eq(s.users.username, username)))[0]
  }
  /** 在同一事务中创建人员并记录注册事件，账号重复由唯一约束兜底。 */
  async register(values: typeof s.users.$inferInsert) {
    return unique(
      this.database.transaction(async (tx) => {
        const [result] = await tx.insert(s.users).values(values)
        await audit(tx, null, "register", "user", result.insertId, null, {
          username: values.username,
          status: "PENDING",
        })
        return { id: result.insertId, status: "PENDING" as const }
      }),
    )
  }
  /** 范围条件与筛选一起进入 SQL，分页列表和 total 使用同一条件。 */
  async listUsers(actor: Actor, query: ListQuery, registrations = false) {
    let scope: SQL | undefined
    if (actor.profile.dataScope === "SELF") scope = eq(s.users.id, actor.user.id)
    // 主键均大于零，用 [0] 表示空组织集合，避免空范围意外变成不加过滤。
    else if (actor.profile.dataScope !== "ALL")
      scope = inArray(s.users.orgId, actor.orgIds.length ? actor.orgIds : [0])
    const where = and(
      scope,
      registrations ? inArray(s.users.status, ["PENDING", "REJECTED"]) : undefined,
      query.status ? eq(s.users.status, query.status as User["status"]) : undefined,
      query.keyword
        ? or(like(s.users.name, `%${query.keyword}%`), like(s.users.username, `%${query.keyword}%`))
        : undefined,
    )
    const fields = {
      id: s.users.id,
      name: s.users.name,
      username: s.users.username,
      createdAt: s.users.createdAt,
    }
    const sortKey = resolveSort(query, fields, "createdAt") as keyof typeof fields
    const order = query.sortOrder === "asc" ? asc : desc
    const rows = await this.database
      .select()
      .from(s.users)
      .where(where)
      .orderBy(order(fields[sortKey]), desc(s.users.createdAt), desc(s.users.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
    const [total] = await this.database.select({ count: count() }).from(s.users).where(where)
    return {
      list: rows.map(safeUser),
      total: total.count,
      page: query.page,
      pageSize: query.pageSize,
    }
  }
  /**
   * 人员变更的共用事务：prepare 校验最新状态并返回补丁，仓储负责持久化和审计。
   * 账号字段、角色关系及审计一起提交，任一步失败则整体回滚。
   * @param prepare 在锁定后的身份状态上校验，返回字段补丁及可选的完整授权集合。
   * @returns 已移除密码哈希的最新人员记录。
   */
  async changeUser(
    id: number,
    actorId: number,
    action: string,
    prepare: (
      state: IdentityState,
      target: User,
    ) => {
      patch: Partial<typeof s.users.$inferInsert>
      authorization?: AuthorizationInput
    },
  ) {
    return unique(
      this.database.transaction(async (tx) => {
        const state = await loadState(tx, true)
        const target = state.users.find((item) => item.id === id)
        if (!target) throw AppError.notFound()
        const change = prepare(state, target)
        if (
          change.patch.positionCode &&
          change.patch.positionCode !== target.positionCode &&
          !canSupervise(change.patch.positionCode)
        ) {
          const memberships = await tx
            .select()
            .from(s.projectMemberships)
            .innerJoin(s.projects, eq(s.projects.id, s.projectMemberships.projectId))
            .where(and(eq(s.projectMemberships.userId, id), sql`${s.projects.deletedAt} is null`))
          const rows = memberships.map((m) => m.contract_memberships)
          if (
            rows.some((m, i) =>
              rows.some(
                (n, j) =>
                  i !== j &&
                  m.projectId !== n.projectId &&
                  m.startDate <= n.endDate &&
                  m.endDate >= n.startDate,
              ),
            )
          )
            throw AppError.conflict("该人员存在期间重叠的合同包项目，请先调整项目归属再变更岗位")
        }
        // 同内容重复批准返回空补丁，不重复递增 version，也不产生重复审计。
        if (!change.authorization && Object.keys(change.patch).length === 0) return safeUser(target)
        await tx
          .update(s.users)
          .set({ ...change.patch, version: target.version + 1 })
          .where(eq(s.users.id, id))
        // 授权表单提交的是完整集合，先删除再重建，空数组表示清空对应授权。
        if (change.authorization) {
          const input = change.authorization
          await tx.delete(s.userRoles).where(eq(s.userRoles.userId, id))
          await tx.delete(s.userExtraPermissions).where(eq(s.userExtraPermissions.userId, id))
          await tx.delete(s.userManagedOrgs).where(eq(s.userManagedOrgs.userId, id))
          if (input.roleIds.length)
            await tx
              .insert(s.userRoles)
              .values(input.roleIds.map((roleId) => ({ userId: id, roleId })))
          if (input.extraPermissions.length)
            await tx
              .insert(s.userExtraPermissions)
              .values(
                input.extraPermissions.map((permissionCode) => ({ userId: id, permissionCode })),
              )
          if (input.managedOrgIds.length)
            await tx
              .insert(s.userManagedOrgs)
              .values(input.managedOrgIds.map((orgId) => ({ userId: id, orgId })))
        }
        const after = (await tx.select().from(s.users).where(eq(s.users.id, id)))[0]
        await audit(tx, actorId, action, "user", id, safeUser(target), {
          ...safeUser(after),
          ...(change.authorization ? { authorization: change.authorization } : {}),
        })
        return safeUser(after)
      }),
    )
  }
  /** 执行组织新增、更新或删除；prepare 在持锁后校验引用与版本，values=null 表示删除。 */
  async changeOrg(
    id: number | null,
    actorId: number,
    values: typeof s.organizations.$inferInsert | null,
    prepare: (state: IdentityState) => void,
  ) {
    return unique(
      this.database.transaction(async (tx) => {
        const state = await loadState(tx, true)
        prepare(state)
        const before = state.orgs.find((item) => item.id === id) ?? null
        if (id && !before) throw AppError.notFound()
        if (!values) await tx.delete(s.organizations).where(eq(s.organizations.id, id!))
        else if (id)
          await tx
            .update(s.organizations)
            .set({ ...values, version: before!.version + 1 })
            .where(eq(s.organizations.id, id))
        else {
          const [result] = await tx.insert(s.organizations).values(values)
          id = result.insertId
        }
        await audit(
          tx,
          actorId,
          values ? "save-org" : "delete-org",
          "organization",
          id,
          before,
          values,
        )
        return { id }
      }),
    )
  }
  /** permissionCodes 未传表示不改权限，空数组表示清空；与删除角色的分支区分。 */
  async changeRole(
    id: number | null,
    actorId: number,
    values: typeof s.roles.$inferInsert | null,
    permissionCodes: string[] | undefined,
    prepare: (state: IdentityState) => void,
  ) {
    return unique(
      this.database.transaction(async (tx) => {
        const state = await loadState(tx, true)
        prepare(state)
        const before = state.roles.find((item) => item.id === id) ?? null
        if (id && !before) throw AppError.notFound()
        if (id && !values && !permissionCodes) {
          await tx.delete(s.rolePermissions).where(eq(s.rolePermissions.roleId, id))
          await tx.delete(s.roles).where(eq(s.roles.id, id))
        } else {
          if (id)
            await tx
              .update(s.roles)
              .set({ ...(values ?? {}), version: before!.version + 1 })
              .where(eq(s.roles.id, id))
          else {
            const [result] = await tx.insert(s.roles).values(values!)
            id = result.insertId
          }
          if (permissionCodes) {
            await tx.delete(s.rolePermissions).where(eq(s.rolePermissions.roleId, id!))
            if (permissionCodes.length)
              await tx
                .insert(s.rolePermissions)
                .values(permissionCodes.map((permissionCode) => ({ roleId: id!, permissionCode })))
          }
        }
        await audit(tx, actorId, "save-role", "role", id, before, { ...values, permissionCodes })
        return { id }
      }),
    )
  }
  /** 按操作人、动作、对象及日期筛选日志，列表和总条数使用相同条件。 */
  async logs(
    query: ListQuery,
    filters: {
      actorId?: number
      actorName?: string
      action?: string
      entityType?: string
      dateFrom?: string
      dateTo?: string
    },
  ) {
    const actorName = filters.actorName?.trim()
    // 界面提交自然日期，按业务时区 UTC+8 转为起止时刻，再与数据库 UTC 时间比较。
    const where = and(
      filters.actorId ? eq(s.auditLogs.actorId, filters.actorId) : undefined,
      // 姓名按普通文本包含匹配，输入中的 %、_ 不作为 SQL 通配符。
      actorName ? sql`instr(${s.users.name}, ${actorName}) > 0` : undefined,
      filters.action ? eq(s.auditLogs.action, filters.action) : undefined,
      filters.entityType ? eq(s.auditLogs.entityType, filters.entityType) : undefined,
      filters.dateFrom
        ? gte(s.auditLogs.createdAt, new Date(`${filters.dateFrom}T00:00:00+08:00`))
        : undefined,
      filters.dateTo
        ? lte(s.auditLogs.createdAt, new Date(`${filters.dateTo}T23:59:59.999+08:00`))
        : undefined,
    )
    const fields = { id: s.auditLogs.id, createdAt: s.auditLogs.createdAt, actorName: s.users.name }
    const sortKey = resolveSort(query, fields, "createdAt") as keyof typeof fields
    const order = query.sortOrder === "asc" ? asc : desc
    const list = await this.database
      .select({ ...getTableColumns(s.auditLogs), actorName: s.users.name })
      .from(s.auditLogs)
      // 取当前姓名，不限制账号状态；未登录申请等无操作人的日志仍保留。
      .leftJoin(s.users, eq(s.auditLogs.actorId, s.users.id))
      .where(where)
      .orderBy(
        asc(sql`${fields[sortKey]} IS NULL`),
        order(fields[sortKey]),
        desc(s.auditLogs.createdAt),
        desc(s.auditLogs.id),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
    const [total] = await this.database
      .select({ count: count() })
      .from(s.auditLogs)
      .leftJoin(s.users, eq(s.auditLogs.actorId, s.users.id))
      .where(where)
    return { list, total: total.count, page: query.page, pageSize: query.pageSize }
  }
  /** 记录登录、退出等没有业务字段变更的账号事件。 */
  async record(actorId: number, action: string) {
    await this.database.transaction((tx) => audit(tx, actorId, action, "user", actorId, null, null))
  }
}
export const identityRepository = new IdentityRepository()
