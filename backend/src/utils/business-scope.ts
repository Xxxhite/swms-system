import { and, eq, exists, or, sql } from "drizzle-orm"
import * as s from "@/db/schema"
import type { Actor } from "./authorization"
import { AppError } from "./errors"
import { managementPositions } from "@/modules/identity/identity.constants"
/** 管理岗位由固定编码表达，与账号角色、组织数据范围分别判断。 */
export function isManagement(actor: Actor): boolean {
  return managementPositions.includes(actor.user.positionCode ?? "")
}
/** 明确的项目负责人关系用于读取与维护；创建人不能永久保留已转出项目的权限。 */
export function responsibleFor(
  actor: Actor,
  project: { directorId: number; seniorDirectorId: number; supervisorId: number | null },
): boolean {
  return (
    isManagement(actor) &&
    [project.directorId, project.seniorDirectorId, project.supervisorId].includes(actor.user.id)
  )
}
/** 开发超级管理员可配置业务，普通账号继续检查实际管理岗位。 */
export function canConfigureProjects(actor: Actor): boolean {
  return !!actor.profile.isDevSuperadmin || isManagement(actor)
}
/** 开发维护能力独立于项目负责关系，不改变实际岗位及督导资格。 */
export function canMaintainProject(
  actor: Actor,
  project: Parameters<typeof responsibleFor>[1],
): boolean {
  return !!actor.profile.isDevSuperadmin || responsibleFor(actor, project)
}
/** 只有显式开发账号全局读取；其他查询由负责信息或本人团队成员关联收紧。 */
export function projectScope(actor: Actor) {
  if (actor.profile.isDevSuperadmin) return sql`true`
  if (isManagement(actor))
    return or(
      eq(s.projects.directorId, actor.user.id),
      eq(s.projects.seniorDirectorId, actor.user.id),
      eq(s.projects.supervisorId, actor.user.id),
    )
  const teamId = actor.profile.teamId
  if (!teamId) return sql`false`
  return exists(
    sql`(select 1 from ${s.projectTeams} where ${and(eq(s.projectTeams.projectId, s.projects.id), eq(s.projectTeams.teamId, teamId))})`,
  )
}
/** 团队成员始终仅本团队；管理人员的具体项目关系由项目上下文再验证。 */
export function canReadTeam(actor: Actor, teamId: number): boolean {
  return !!actor.profile.isDevSuperadmin || isManagement(actor) || actor.profile.teamId === teamId
}
/** 写入失败统一返回权限错误，避免继续执行部分更新。 */
export function assertBusinessAccess(
  allowed: boolean,
  message = "不具备该业务的维护权限",
): asserts allowed {
  if (!allowed) throw AppError.forbidden(message)
}
