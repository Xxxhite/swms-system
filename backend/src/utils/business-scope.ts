import { and, eq, exists, inArray, or, sql } from "drizzle-orm"
import * as s from "@/db/schema"
import type { Actor } from "./authorization"
import { AppError } from "./errors"
/** 项目查询范围在 SQL 层收紧；项目可见并不授予其他团队统计访问权。 */
export function projectScope(actor: Actor) {
  const team =
    actor.profile.dataScope === "SELF"
      ? eq(s.projectTeams.reporterId, actor.user.id)
      : inArray(s.projectTeams.teamId, actor.orgIds)
  const participating = exists(
    sql`(select 1 from ${s.projectTeams} where ${and(eq(s.projectTeams.projectId, s.projects.id), team)})`,
  )
  if (actor.profile.dataScope === "ALL") return sql`true`
  if (actor.profile.dataScope === "SELF")
    return or(
      eq(s.projects.createdBy, actor.user.id),
      eq(s.projects.directorId, actor.user.id),
      eq(s.projects.supervisorId, actor.user.id),
      participating,
      exists(
        sql`(select 1 from ${s.monthlyReports} inner join ${s.projectIndicators} on ${s.monthlyReports.indicatorId} = ${s.projectIndicators.id} where ${s.projectIndicators.projectId} = ${s.projects.id} and ${s.monthlyReports.createdBy} = ${actor.user.id})`,
      ),
    )
  if (actor.profile.dataScope === "SUBTREE")
    return or(inArray(s.projects.ownerOrgId, actor.orgIds), participating)
  return participating
}
/** 完整团队范围仅 ALL、TEAM 或组织子树拥有；SELF 只能访问本人相关记录。 */
export function canReadTeam(actor: Actor, teamId: number): boolean {
  return (
    actor.profile.dataScope === "ALL" ||
    (actor.profile.dataScope !== "SELF" && actor.orgIds.includes(teamId))
  )
}
/** 写入失败统一返回权限错误，避免继续执行部分更新。 */
export function assertBusinessAccess(
  allowed: boolean,
  message = "不具备该业务的维护权限",
): asserts allowed {
  if (!allowed) throw AppError.forbidden(message)
}
