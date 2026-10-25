import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/db"
import * as s from "@/db/schema"
import { loadState, type Database } from "@/modules/identity/identity.repository"
import { actorFrom } from "@/modules/identity/identity.service"
import type { Actor } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { projectScope } from "@/utils/business-scope"
type RawConnection = Parameters<Parameters<Database["transaction"]>[0]>[0]
/** 事务写入接口：服务层传递业务字段，所有 SQL 构造集中在仓储内。 */
function writer(connection: RawConnection) {
  return {
    projects: {
      insert(values: typeof s.projects.$inferInsert) {
        return connection.insert(s.projects).values(values)
      },
      update(id: number, values: Partial<typeof s.projects.$inferInsert>) {
        return connection.update(s.projects).set(values).where(eq(s.projects.id, id))
      },
      remove(id: number) {
        return connection.delete(s.projects).where(eq(s.projects.id, id))
      },
    },
    projectContracts: {
      insert(values: typeof s.projectContracts.$inferInsert) {
        return connection.insert(s.projectContracts).values(values)
      },
      update(id: number, values: Partial<typeof s.projectContracts.$inferInsert>) {
        return connection
          .update(s.projectContracts)
          .set(values)
          .where(eq(s.projectContracts.id, id))
      },
      remove(id: number) {
        return connection.delete(s.projectContracts).where(eq(s.projectContracts.id, id))
      },
    },
    projectServicePoints: {
      insert(values: typeof s.projectServicePoints.$inferInsert) {
        return connection.insert(s.projectServicePoints).values(values)
      },
      update(id: number, values: Partial<typeof s.projectServicePoints.$inferInsert>) {
        return connection
          .update(s.projectServicePoints)
          .set(values)
          .where(eq(s.projectServicePoints.id, id))
      },
      remove(id: number) {
        return connection.delete(s.projectServicePoints).where(eq(s.projectServicePoints.id, id))
      },
    },
    contractFiles: {
      insert(values: typeof s.contractFiles.$inferInsert) {
        return connection.insert(s.contractFiles).values(values)
      },
      update(id: number, values: Partial<typeof s.contractFiles.$inferInsert>) {
        return connection.update(s.contractFiles).set(values).where(eq(s.contractFiles.id, id))
      },
    },
    projectMemberships: {
      insert(values: typeof s.projectMemberships.$inferInsert) {
        return connection.insert(s.projectMemberships).values(values)
      },
      update(id: number, values: Partial<typeof s.projectMemberships.$inferInsert>) {
        return connection
          .update(s.projectMemberships)
          .set(values)
          .where(eq(s.projectMemberships.id, id))
      },
      remove(id: number) {
        return connection.delete(s.projectMemberships).where(eq(s.projectMemberships.id, id))
      },
    },
    projectTeams: {
      insert(values: typeof s.projectTeams.$inferInsert) {
        return connection.insert(s.projectTeams).values(values)
      },
      update(id: number, values: Partial<typeof s.projectTeams.$inferInsert>) {
        return connection.update(s.projectTeams).set(values).where(eq(s.projectTeams.id, id))
      },
      remove(id: number) {
        return connection.delete(s.projectTeams).where(eq(s.projectTeams.id, id))
      },
    },
    projectIndicators: {
      insert(values: typeof s.projectIndicators.$inferInsert) {
        return connection.insert(s.projectIndicators).values(values)
      },
      update(id: number, values: Partial<typeof s.projectIndicators.$inferInsert>) {
        return connection
          .update(s.projectIndicators)
          .set(values)
          .where(eq(s.projectIndicators.id, id))
      },
      remove(id: number) {
        return connection.delete(s.projectIndicators).where(eq(s.projectIndicators.id, id))
      },
    },
    teamIndicatorTargets: {
      insert(values: typeof s.teamIndicatorTargets.$inferInsert) {
        return connection.insert(s.teamIndicatorTargets).values(values)
      },
      update(id: number, values: Partial<typeof s.teamIndicatorTargets.$inferInsert>) {
        return connection
          .update(s.teamIndicatorTargets)
          .set(values)
          .where(eq(s.teamIndicatorTargets.id, id))
      },
      remove(id: number) {
        return connection.delete(s.teamIndicatorTargets).where(eq(s.teamIndicatorTargets.id, id))
      },
    },
    monthlyReports: {
      insert(values: typeof s.monthlyReports.$inferInsert) {
        return connection.insert(s.monthlyReports).values(values)
      },
      update(id: number, values: Partial<typeof s.monthlyReports.$inferInsert>) {
        return connection.update(s.monthlyReports).set(values).where(eq(s.monthlyReports.id, id))
      },
      remove(id: number) {
        return connection.delete(s.monthlyReports).where(eq(s.monthlyReports.id, id))
      },
    },
    monthlyReportChanges: {
      insert(values: typeof s.monthlyReportChanges.$inferInsert) {
        return connection.insert(s.monthlyReportChanges).values(values)
      },
      update(id: number, values: Partial<typeof s.monthlyReportChanges.$inferInsert>) {
        return connection
          .update(s.monthlyReportChanges)
          .set(values)
          .where(eq(s.monthlyReportChanges.id, id))
      },
      remove(id: number) {
        return connection.delete(s.monthlyReportChanges).where(eq(s.monthlyReportChanges.id, id))
      },
    },
    approvalInstances: {
      insert(values: typeof s.approvalInstances.$inferInsert) {
        return connection.insert(s.approvalInstances).values(values)
      },
      update(id: number, values: Partial<typeof s.approvalInstances.$inferInsert>) {
        return connection
          .update(s.approvalInstances)
          .set(values)
          .where(eq(s.approvalInstances.id, id))
      },
      remove(id: number) {
        return connection.delete(s.approvalInstances).where(eq(s.approvalInstances.id, id))
      },
    },
    approvalTasks: {
      insert(values: typeof s.approvalTasks.$inferInsert) {
        return connection.insert(s.approvalTasks).values(values)
      },
      update(id: number, values: Partial<typeof s.approvalTasks.$inferInsert>) {
        return connection.update(s.approvalTasks).set(values).where(eq(s.approvalTasks.id, id))
      },
      remove(id: number) {
        return connection.delete(s.approvalTasks).where(eq(s.approvalTasks.id, id))
      },
    },
    approvalRecords: {
      insert(values: typeof s.approvalRecords.$inferInsert) {
        return connection.insert(s.approvalRecords).values(values)
      },
      update(id: number, values: Partial<typeof s.approvalRecords.$inferInsert>) {
        return connection.update(s.approvalRecords).set(values).where(eq(s.approvalRecords.id, id))
      },
      remove(id: number) {
        return connection.delete(s.approvalRecords).where(eq(s.approvalRecords.id, id))
      },
    },
    auditLogs: {
      insert(values: typeof s.auditLogs.$inferInsert) {
        return connection.insert(s.auditLogs).values(values)
      },
      update(id: number, values: Partial<typeof s.auditLogs.$inferInsert>) {
        return connection.update(s.auditLogs).set(values).where(eq(s.auditLogs.id, id))
      },
      remove(id: number) {
        return connection.delete(s.auditLogs).where(eq(s.auditLogs.id, id))
      },
    },
  }
}
export type BusinessConnection = ReturnType<typeof writer>
/** 加载业务关联：读查询先在 SQL 裁剪项目及关联表，写事务锁定固定顺序的业务行。 */
async function state(tx: RawConnection, actor?: Actor, lock = false) {
  const identity = await loadState(tx, lock)
  const current = actor
    ? actorFrom(identity, identity.users.find((u) => u.id === actor.user.id) ?? actor.user)
    : undefined
  if (
    actor &&
    (!current ||
      current.user.authVersion !== actor.user.authVersion ||
      current.user.status !== "ACTIVE")
  )
    throw AppError.tokenExpired()
  const query = tx
    .select()
    .from(s.projects)
    .where(current ? and(isNull(s.projects.deletedAt), projectScope(current)) : undefined)
    .orderBy(asc(s.projects.id))
  const projects = await (lock ? query.for("update") : query)
  const ids = projects.map((p) => p.id)
  const indicators = await tx
    .select()
    .from(s.projectIndicators)
    .where(actor ? inArray(s.projectIndicators.projectId, ids) : undefined)
  const indicatorIds = indicators.map((i) => i.id)
  return {
    identity,
    actor: current,
    projects,
    contracts: await tx
      .select()
      .from(s.projectContracts)
      .where(actor ? inArray(s.projectContracts.projectId, ids) : undefined),
    teams: await tx
      .select()
      .from(s.projectTeams)
      .where(actor ? inArray(s.projectTeams.projectId, ids) : undefined),
    files: await tx
      .select()
      .from(s.contractFiles)
      .where(actor ? inArray(s.contractFiles.projectId, ids) : undefined),
    members: await tx
      .select()
      .from(s.projectMemberships)
      .where(actor ? inArray(s.projectMemberships.projectId, ids) : undefined),
    points: await tx
      .select()
      .from(s.projectServicePoints)
      .where(actor ? inArray(s.projectServicePoints.projectId, ids) : undefined),
    indicators,
    targets: await tx
      .select()
      .from(s.teamIndicatorTargets)
      .where(actor ? inArray(s.teamIndicatorTargets.indicatorId, indicatorIds) : undefined),
    reports: await tx
      .select()
      .from(s.monthlyReports)
      .where(actor ? inArray(s.monthlyReports.indicatorId, indicatorIds) : undefined),
    legacyChanges: await tx.select().from(s.legacyMonthlyReportChanges),
    changes: await tx.select().from(s.monthlyReportChanges),
    instances: await tx.select().from(s.approvalInstances),
    tasks: await tx.select().from(s.approvalTasks),
    records: await tx.select().from(s.approvalRecords),
  }
}
export type BusinessState = Awaited<ReturnType<typeof state>>
/** 项目业务仓储：事务集中处理数据库访问，服务层接收同一快照并执行业务规则。 */
export class ProjectRepository {
  constructor(readonly database: Database = db) {}
  /** 读操作在一致的事务快照内执行，项目范围由 SQL 预先限制。 */
  read<T>(actor: Actor, work: (data: BusinessState) => Promise<T> | T): Promise<T> {
    return this.database.transaction(async (tx) => {
      const data = await state(tx, actor)
      // 等待读事务期间若权限被撤销，本次请求直接失败，避免使用旧授权继续输出。
      if (actor.profile.permissions.some((code) => !data.actor!.profile.permissions.includes(code)))
        throw AppError.forbidden("权限已变化，请刷新后重试")
      return work(data)
    })
  }
  /** 写入先按身份表、项目表顺序加锁，重新计算权限后再执行业务变更与审计。 */
  write<T>(
    actor: Actor,
    work: (tx: BusinessConnection, data: BusinessState, current: Actor) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      const data = await state(tx, undefined, true)
      const user = data.identity.users.find((u) => u.id === actor.user.id)
      if (!user || user.authVersion !== actor.user.authVersion) throw AppError.tokenExpired()
      const current = actorFrom(data.identity, user)
      return work(writer(tx), data, current)
    })
  }
  /** 审批快照只按实际任务关系授权，由审批服务裁剪输出。 */
  approvals<T>(actor: Actor, work: (data: BusinessState) => Promise<T> | T): Promise<T> {
    return this.database.transaction(async (tx) => {
      const data = await state(tx),
        user = data.identity.users.find((u) => u.id === actor.user.id)
      if (!user || user.status !== "ACTIVE" || user.authVersion !== actor.user.authVersion)
        throw AppError.tokenExpired()
      const current = actorFrom(data.identity, user)
      if (actor.profile.permissions.some((code) => !current.profile.permissions.includes(code)))
        throw AppError.forbidden("权限已变化，请刷新后重试")
      data.actor = current
      return work(data)
    })
  }
}
export const projectRepository = new ProjectRepository()
