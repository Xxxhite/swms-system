import {
  descendants,
  teamFor,
  requireAdmin,
  requirePermission,
  canSee,
  assertVersion,
  safeUser,
  type Actor,
  type User,
} from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { dictionaries, positions } from "./identity.constants"
import {
  identityRepository,
  type IdentityRepository,
  type IdentityState,
  type AuthorizationInput,
  type ListQuery,
} from "./identity.repository"

/** 根据账号及关联表计算有效身份；角色负责功能权限，账号 dataScope 独立决定数据范围。 */
export function actorFrom(state: IdentityState, user: User): Actor {
  const active = user.status === "ACTIVE"
  const assigned = state.roles.filter(
    (role) =>
      role.status === "ACTIVE" &&
      state.userRoles.some((item) => item.userId === user.id && item.roleId === role.id),
  )
  // 仅启用角色参与权限合并，个人附加权限取并集；多个角色不会自动扩大 dataScope。
  const permissions = [
    ...new Set([
      ...state.rolePermissions
        .filter((item) => assigned.some((role) => role.id === item.roleId))
        .map((item) => item.permissionCode),
      ...state.extras.filter((item) => item.userId === user.id).map((item) => item.permissionCode),
    ]),
  ]
  const org = state.orgs.find((item) => item.id === user.orgId)
  // 待分配人员仅保留本人及已授权知识入口；管理员例外，确保初始化后能管理机构。
  const unassigned =
    (!org || org.code === "unassigned") && !assigned.some((role) => role.code === "admin")
  const managedOrgIds = active
    ? state.managed.filter((item) => item.userId === user.id).map((item) => item.orgId)
    : []
  const team = active ? teamFor(state.orgs, user.orgId) : undefined
  // TEAM/SUBTREE 展开成组织 ID 集合供列表和详情复用；SELF 直接按人员 ID 校验。
  const orgIds = unassigned
    ? []
    : user.dataScope === "ALL"
      ? state.orgs.map((item) => item.id)
      : user.dataScope === "TEAM"
        ? descendants(state.orgs, team ? [team.id] : [])
        : user.dataScope === "SUBTREE"
          ? descendants(state.orgs, managedOrgIds)
          : []
  return {
    user,
    orgIds,
    profile: {
      id: user.id,
      username: user.username,
      name: user.name,
      status: user.status,
      reviewComment: user.reviewComment,
      orgId: active ? user.orgId : null,
      orgName: active ? (state.orgs.find((item) => item.id === user.orgId)?.name ?? null) : null,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      positionCode: active ? user.positionCode : null,
      supervisorId: active ? user.supervisorId : null,
      managedOrgIds,
      dataScope: active && !unassigned ? user.dataScope : "SELF",
      roles: active ? assigned.map((item) => item.code) : [],
      roleNames: active ? assigned.map((item) => item.name) : [],
      permissions: active
        ? unassigned
          ? permissions.filter((code) => code.startsWith("knowledge:"))
          : permissions
        : [],
    },
  }
}
/** 写事务内再次授权，避免请求鉴权通过后、等待锁期间账号状态或角色已被更改。 */
function fresh(state: IdentityState, actor: Actor, permission: string): Actor {
  const user = state.users.find((item) => item.id === actor.user.id)
  if (!user || user.authVersion !== actor.user.authVersion) throw AppError.tokenExpired()
  const current = actorFrom(state, user)
  requireAdmin(current, permission)
  return current
}
export function validateAuthorization(state: IdentityState, input: AuthorizationInput) {
  if (
    new Set(input.roleIds).size !== input.roleIds.length ||
    new Set(input.extraPermissions).size !== input.extraPermissions.length ||
    new Set(input.managedOrgIds).size !== input.managedOrgIds.length
  )
    throw AppError.badRequest("授权条目重复")
  if (
    input.roleIds.some(
      (id) => !state.roles.some((role) => role.id === id && role.status === "ACTIVE"),
    )
  )
    throw AppError.badRequest("角色不存在或已停用")
  if (input.extraPermissions.some((code) => !state.permissions.some((item) => item.code === code)))
    throw AppError.badRequest("权限编码不存在")
  if (
    input.managedOrgIds.some(
      (id) => !state.orgs.some((org) => org.id === id && org.status === "ACTIVE"),
    )
  )
    throw AppError.badRequest("负责组织不存在或已停用")
  if (input.dataScope === "SUBTREE" && !input.managedOrgIds.length)
    throw AppError.badRequest("请选择负责组织")
}
function administratorIds(state: IdentityState): number[] {
  const role = state.roles.find((item) => item.code === "admin" && item.status === "ACTIVE")
  return state.users
    .filter(
      (user) =>
        user.status === "ACTIVE" &&
        state.userRoles.some((item) => item.userId === user.id && item.roleId === role?.id),
    )
    .map((item) => item.id)
}
/** 基于锁定后的身份状态检查，防止并发停用或移除角色导致机构无人能管理。 */
function protectAdministrator(
  state: IdentityState,
  target: User,
  status: User["status"],
  roleIds?: number[],
) {
  const admins = administratorIds(state)
  const adminRole = state.roles.find((item) => item.code === "admin")
  if (
    admins.length === 1 &&
    admins[0] === target.id &&
    (status !== "ACTIVE" || (roleIds && !roleIds.includes(adminRole!.id)))
  )
    throw AppError.conflict("必须保留至少一名启用的机构管理员")
}
export type Placement = { orgId: number; positionCode: string; supervisorId: number | null }
function validatePlacement(state: IdentityState, target: User, input: Placement) {
  if (!state.orgs.some((org) => org.id === input.orgId && org.status === "ACTIVE"))
    throw AppError.badRequest("请选择启用的组织")
  if (!positions.some((item) => item.code === input.positionCode))
    throw AppError.badRequest("岗位编码不存在")
  let id = input.supervisorId
  // 从目标本人开始记录，既拦截自设主管，也拦截经多级主管回到本人的间接循环。
  const visited = new Set<number>([target.id])
  while (id !== null) {
    if (visited.has(id)) throw AppError.conflict("主管关系不能形成循环")
    visited.add(id)
    const supervisor = state.users.find((user) => user.id === id)
    if (!supervisor || supervisor.status !== "ACTIVE")
      throw AppError.badRequest("主管不存在或未启用")
    id = supervisor.supervisorId
  }
}
export function validateServiceField(value: string | null | undefined) {
  if (value && !dictionaries.serviceFields.some((item) => item.code === value))
    throw AppError.badRequest("服务领域不存在")
}

export class IdentityService {
  constructor(readonly repository: IdentityRepository = identityRepository) {}
  async actor(id: number) {
    const state = await this.repository.state()
    const user = state.users.find((item) => item.id === id)
    if (!user) throw AppError.unauthorized()
    return actorFrom(state, user)
  }
  async orgs(actor: Actor) {
    const state = await this.repository.state()
    const visible =
      actor.profile.dataScope === "ALL"
        ? state.orgs
        : state.orgs.filter(
            (item) => actor.orgIds.includes(item.id) || item.id === actor.user.orgId,
          )
    // 上级可能被数据范围裁掉，将可见子树的首节点作为根，避免暴露不可见上级关系。
    return visible
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((org) => ({
        ...org,
        parentId: visible.some((item) => item.id === org.parentId) ? org.parentId : null,
      }))
  }
  listUsers(actor: Actor, query: ListQuery, registrations = false) {
    if (registrations) requireAdmin(actor, "system:registration:view")
    else requirePermission(actor, "system:user:view")
    return this.repository.listUsers(actor, query, registrations)
  }
  async user(actor: Actor, id: number, registration = false) {
    if (registration) requireAdmin(actor, "system:registration:view")
    else requirePermission(actor, "system:user:view")
    const user = await this.repository.findUser(id)
    if (!user) throw AppError.notFound()
    if (!canSee(actor, user)) throw AppError.forbidden()
    const state = await this.repository.state()
    return {
      ...safeUser(user),
      ...actorFrom(state, user).profile,
      roleIds: state.userRoles.filter((item) => item.userId === id).map((item) => item.roleId),
      extraPermissions: state.extras
        .filter((item) => item.userId === id)
        .map((item) => item.permissionCode),
      managedOrgIds: state.managed.filter((item) => item.userId === id).map((item) => item.orgId),
    }
  }
  approve(actor: Actor, id: number, input: AuthorizationInput & Placement & { version: number }) {
    requireAdmin(actor, "system:registration:approve")
    return this.repository.changeUser(
      id,
      actor.user.id,
      "approve-registration",
      (state, target) => {
        const currentActor = fresh(state, actor, "system:registration:approve")
        if (!canSee(currentActor, target)) throw AppError.forbidden()
        // 批准请求可能因重试或并发再次到达；已启用且授权完全一致时视为同一次成功。
        if (target.status === "ACTIVE") {
          // 授权数组按集合比较，表单选项顺序不影响幂等判断。
          const assigned = state.userRoles
            .filter((row) => row.userId === id)
            .map((row) => row.roleId)
            .sort()
            .join(",")
          const extras = state.extras
            .filter((row) => row.userId === id)
            .map((row) => row.permissionCode)
            .sort()
            .join(",")
          const managed = state.managed
            .filter((row) => row.userId === id)
            .map((row) => row.orgId)
            .sort()
            .join(",")
          if (
            target.orgId !== input.orgId ||
            target.positionCode !== input.positionCode ||
            target.supervisorId !== input.supervisorId ||
            target.dataScope !== input.dataScope ||
            assigned !== [...input.roleIds].sort().join(",") ||
            extras !== [...input.extraPermissions].sort().join(",") ||
            managed !== [...input.managedOrgIds].sort().join(",")
          )
            throw AppError.conflict("已审核，授权内容已变化")
          return { patch: {} }
        }
        // 首次批准才校验申请版本；确认管理员看到的申请资料没有被员工再次修改。
        assertVersion(target.version, input.version)
        if (target.status !== "PENDING") throw AppError.conflict("仅待审核账号可批准")
        validateAuthorization(state, input)
        validatePlacement(state, target, input)
        return {
          patch: {
            orgId: input.orgId,
            positionCode: input.positionCode,
            supervisorId: input.supervisorId,
            dataScope: input.dataScope,
            status: "ACTIVE",
            reviewComment: null,
            reviewedBy: actor.user.id,
            reviewedAt: new Date(),
            // 批准后撤销旧的受限凭证，员工重新登录获取正式业务身份。
            authVersion: target.authVersion + 1,
          },
          authorization: input,
        }
      },
    )
  }
  reject(actor: Actor, id: number, input: { version: number; comment: string }) {
    requireAdmin(actor, "system:registration:approve")
    return this.repository.changeUser(id, actor.user.id, "reject-registration", (state, target) => {
      const currentActor = fresh(state, actor, "system:registration:approve")
      if (!canSee(currentActor, target)) throw AppError.forbidden()
      assertVersion(target.version, input.version)
      if (target.status !== "PENDING") throw AppError.conflict("仅待审核账号可驳回")
      if (!input.comment.trim()) throw AppError.badRequest("请填写驳回意见")
      return {
        patch: {
          status: "REJECTED",
          reviewComment: input.comment.trim(),
          reviewedBy: actor.user.id,
          reviewedAt: new Date(),
        },
      }
    })
  }
  updateUser(
    actor: Actor,
    id: number,
    input: Placement & {
      version: number
      name: string
      phone: string
      socialWorkerNo?: string | null
      serviceFieldCode?: string | null
    },
  ) {
    requireAdmin(actor, "system:user:manage")
    validateServiceField(input.serviceFieldCode)
    return this.repository.changeUser(id, actor.user.id, "update-user", (state, target) => {
      const currentActor = fresh(state, actor, "system:user:manage")
      if (!canSee(currentActor, target)) throw AppError.forbidden()
      assertVersion(target.version, input.version)
      if (target.status === "PENDING" || target.status === "REJECTED")
        throw AppError.conflict("请通过注册审核处理此账号")
      validatePlacement(state, target, input)
      return {
        patch: {
          name: input.name,
          phone: input.phone,
          orgId: input.orgId,
          positionCode: input.positionCode,
          supervisorId: input.supervisorId,
          socialWorkerNo: input.socialWorkerNo,
          serviceFieldCode: input.serviceFieldCode,
        },
      }
    })
  }
  status(
    actor: Actor,
    id: number,
    input: { version: number; status: "ACTIVE" | "DISABLED" | "LEFT" },
  ) {
    requireAdmin(actor, "system:user:manage")
    return this.repository.changeUser(id, actor.user.id, "change-status", (state, target) => {
      const currentActor = fresh(state, actor, "system:user:manage")
      if (!canSee(currentActor, target)) throw AppError.forbidden()
      assertVersion(target.version, input.version)
      if (target.status === "PENDING" || target.status === "REJECTED")
        throw AppError.conflict("待审核账号需先完成审核")
      protectAdministrator(state, target, input.status)
      if (
        input.status !== "ACTIVE" &&
        state.users.some((user) => user.supervisorId === id && user.status === "ACTIVE")
      )
        throw AppError.conflict("请先为直属下属指定新主管")
      return { patch: { status: input.status, authVersion: target.authVersion + 1 } }
    })
  }
  authorize(actor: Actor, id: number, input: AuthorizationInput & { version: number }) {
    requireAdmin(actor, "system:user:authorize")
    return this.repository.changeUser(id, actor.user.id, "authorize-user", (state, target) => {
      const currentActor = fresh(state, actor, "system:user:authorize")
      if (!canSee(currentActor, target)) throw AppError.forbidden()
      assertVersion(target.version, input.version)
      if (target.status !== "ACTIVE") throw AppError.conflict("仅可配置启用账号权限")
      validateAuthorization(state, input)
      protectAdministrator(state, target, target.status, input.roleIds)
      return { patch: { dataScope: input.dataScope }, authorization: input }
    })
  }
  saveOrg(
    actor: Actor,
    id: number | null,
    input: {
      code: string
      name: string
      parentId: number | null
      type: "HEADQUARTERS" | "DEPARTMENT" | "TEAM"
      status: "ACTIVE" | "DISABLED"
      sortOrder: number
      version?: number
    },
  ) {
    requireAdmin(actor, "system:org:manage")
    return this.repository.changeOrg(id, actor.user.id, input, (state) => {
      fresh(state, actor, "system:org:manage")
      const existing = state.orgs.find((org) => org.id === id)
      if (id && existing) assertVersion(existing.version, input.version!)
      if (
        input.parentId !== null &&
        !state.orgs.some((org) => org.id === input.parentId && org.status === "ACTIVE")
      )
        throw AppError.badRequest("父组织不存在或已停用")
      if (id && descendants(state.orgs, [id]).includes(input.parentId ?? 0))
        throw AppError.conflict("组织关系不能形成循环")
      if (
        id &&
        existing?.type !== input.type &&
        (state.orgs.some((org) => org.parentId === id) ||
          state.users.some((user) => user.orgId === id))
      )
        throw AppError.conflict("已有引用的组织不能变更类型")
      if (
        id &&
        input.status === "DISABLED" &&
        (state.users.some((user) => user.orgId === id) ||
          state.orgs.some((org) => org.parentId === id) ||
          state.managed.some((item) => item.orgId === id))
      )
        throw AppError.conflict("组织仍被人员、下级或负责范围引用")
      // 先在内存中应用本次组织调整，再检查整棵树，覆盖移动上级后形成团队嵌套的情况。
      const simulated = state.orgs
        .filter((org) => org.id !== id)
        .concat({
          ...input,
          id: id ?? -1,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      for (const org of simulated.filter((item) => item.type === "TEAM")) {
        if (teamFor(simulated, org.parentId)) throw AppError.conflict("团队不能嵌套在另一团队下")
      }
    })
  }
  deleteOrg(actor: Actor, id: number, version: number) {
    requireAdmin(actor, "system:org:manage")
    return this.repository.changeOrg(id, actor.user.id, null, (state) => {
      fresh(state, actor, "system:org:manage")
      const target = state.orgs.find((org) => org.id === id)
      if (!target) throw AppError.notFound()
      assertVersion(target.version, version)
      if (
        state.users.some((user) => user.orgId === id) ||
        state.orgs.some((org) => org.parentId === id) ||
        state.managed.some((row) => row.orgId === id)
      )
        throw AppError.conflict("组织仍被引用，请先调整关联")
    })
  }
  async roleList(actor: Actor) {
    requireAdmin(actor, "system:role:manage")
    const state = await this.repository.state()
    return state.roles.map((role) => ({
      ...role,
      permissionCodes: state.rolePermissions
        .filter((row) => row.roleId === role.id)
        .map((row) => row.permissionCode),
    }))
  }
  async permissionList(actor: Actor) {
    requireAdmin(actor, "system:role:manage")
    return (await this.repository.state()).permissions
  }
  saveRole(
    actor: Actor,
    id: number | null,
    input: {
      code: string
      name: string
      description: string
      status: "ACTIVE" | "DISABLED"
      version?: number
    },
  ) {
    requireAdmin(actor, "system:role:manage")
    return this.repository.changeRole(id, actor.user.id, input, undefined, (state) => {
      fresh(state, actor, "system:role:manage")
      const target = state.roles.find((role) => role.id === id)
      if (target) {
        assertVersion(target.version, input.version!)
        if (target.builtIn && target.code !== input.code)
          throw AppError.conflict("内建角色编码不可修改")
        if (target.code === "admin" && input.status !== "ACTIVE")
          throw AppError.conflict("管理员角色必须保持启用")
      }
    })
  }
  rolePermissions(actor: Actor, id: number, codes: string[], version: number) {
    requireAdmin(actor, "system:role:manage")
    return this.repository.changeRole(id, actor.user.id, null, codes, (state) => {
      fresh(state, actor, "system:role:manage")
      const target = state.roles.find((role) => role.id === id)
      if (!target) throw AppError.notFound()
      assertVersion(target.version, version)
      if (target.code === "admin") throw AppError.conflict("内建管理员权限不可删减")
      if (
        new Set(codes).size !== codes.length ||
        codes.some((code) => !state.permissions.some((item) => item.code === code))
      )
        throw AppError.badRequest("权限编码不存在或重复")
    })
  }
  deleteRole(actor: Actor, id: number, version: number) {
    requireAdmin(actor, "system:role:manage")
    return this.repository.changeRole(id, actor.user.id, null, undefined, (state) => {
      fresh(state, actor, "system:role:manage")
      const target = state.roles.find((role) => role.id === id)
      if (!target) throw AppError.notFound()
      assertVersion(target.version, version)
      if (target.builtIn || state.userRoles.some((item) => item.roleId === id))
        throw AppError.conflict("内建或已分配角色不可删除")
    })
  }
}
export const identityService = new IdentityService()
