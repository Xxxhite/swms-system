import type { organizations, users } from "@/db/schema"
import { AppError } from "@/utils/errors"

export type User = typeof users.$inferSelect
export type Organization = typeof organizations.$inferSelect
export type DataScope = User["dataScope"]
export type SafeUser = Omit<User, "passwordHash">
export interface CurrentUser {
  id: number
  username: string
  name: string
  status: User["status"]
  reviewComment: string | null
  roles: string[]
  roleNames: string[]
  orgId: number | null
  orgName: string | null
  teamId: number | null
  teamName: string | null
  positionCode: string | null
  supervisorId: number | null
  managedOrgIds: number[]
  dataScope: DataScope
  permissions: string[]
}
/** 服务端操作人上下文：user 保留校验所需字段，profile 用于展示，orgIds 用于范围过滤。 */
export interface Actor {
  user: User
  profile: CurrentUser
  orgIds: number[]
}

/** 人员信息用于响应或审计前，统一移除密码哈希。 */
export function safeUser(user: User): SafeUser {
  const { passwordHash, ...safe } = user
  void passwordHash
  return safe
}
/** 求多个根组织及其全部后代的并集；Set 同时去重并使遍历在存在循环时仍能结束。 */
export function descendants(orgs: Organization[], roots: number[]): number[] {
  const result = new Set(roots)
  let changed = true
  while (changed) {
    changed = false
    for (const org of orgs) {
      if (org.parentId !== null && result.has(org.parentId) && !result.has(org.id)) {
        result.add(org.id)
        changed = true
      }
    }
  }
  return [...result]
}
/** 沿任职组织向上寻找最近的团队，团队归属由组织关系推导。 */
export function teamFor(orgs: Organization[], orgId: number | null): Organization | undefined {
  const visited = new Set<number>()
  while (orgId !== null && !visited.has(orgId)) {
    visited.add(orgId)
    const org = orgs.find((item) => item.id === orgId)
    if (!org) return
    if (org.type === "TEAM") return org
    orgId = org.parentId
  }
}
export function requirePermission(actor: Actor, permission: string): void {
  if (actor.user.status !== "ACTIVE" || !actor.profile.permissions.includes(permission)) {
    throw AppError.forbidden()
  }
}
/** 系统维护需要管理员角色和具体动作权限；只有个人附加权限仍不能代替管理员身份。 */
export function requireAdmin(actor: Actor, permission: string): void {
  requirePermission(actor, permission)
  if (!actor.profile.roles.includes("admin")) throw AppError.forbidden("仅机构管理员可维护此项")
}
/** 详情和写入的人员范围校验；TEAM/SUBTREE 的组织集合由 actorFrom 预先展开。 */
export function canSee(actor: Actor, user: User): boolean {
  if (actor.profile.dataScope === "ALL") return true
  if (actor.profile.dataScope === "SELF") return user.id === actor.user.id
  return user.orgId !== null && actor.orgIds.includes(user.orgId)
}
/** version 是资料的乐观锁版本，与用于撤销登录凭证的 authVersion 分开维护。 */
export function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) throw AppError.conflict("资料已变化，请刷新后重试")
}
