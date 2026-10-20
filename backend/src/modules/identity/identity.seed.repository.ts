import { eq } from "drizzle-orm"
import type { Database } from "./identity.repository"
import * as s from "@/db/schema"
import { hashPassword } from "@/utils/password"
import { permissionCatalog } from "./identity.constants"

/**
 * 初始化必要身份目录、组织和管理员，保留已有账号密码。
 * @param database 要执行初始化的数据库实例，可注入独立测试库。
 * @param input 管理员账号及显式密码；提供 demoPassword 时另外创建虚构演示账号。
 */
export async function seedIdentity(
  database: Database,
  input: { adminUsername: string; adminPassword: string; demoPassword?: string },
) {
  if (
    !/^[a-z0-9_]{3,32}$/.test(input.adminUsername) ||
    input.adminPassword.length < 8 ||
    input.adminPassword.length > 128
  )
    throw new Error("初始化账号格式不正确或密码不足 8 位")
  if (
    input.demoPassword !== undefined &&
    (input.demoPassword.length < 8 || input.demoPassword.length > 128)
  )
    throw new Error("演示密码须为 8—128 字符")
  const adminHash = await hashPassword(input.adminPassword)
  const demoHash =
    input.demoPassword === undefined ? undefined : await hashPassword(input.demoPassword)
  await database.transaction(async (tx) => {
    for (const permission of permissionCatalog)
      await tx
        .insert(s.permissions)
        .values(permission)
        .onDuplicateKeyUpdate({ set: { name: permission.name } })
    /** 按唯一编码复用或新增组织，返回主键供后续人员和下级节点关联。 */
    const org = async (
      code: string,
      name: string,
      type: typeof s.organizations.$inferInsert.type,
      parentId: number | null,
    ) => {
      const [existing] = await tx
        .select()
        .from(s.organizations)
        .where(eq(s.organizations.code, code))
      if (existing) return existing.id
      const [result] = await tx.insert(s.organizations).values({ code, name, type, parentId })
      return result.insertId
    }
    const root = await org("headquarters", "温馨社工总部", "HEADQUARTERS", null)
    await org("unassigned", "待分配人员", "DEPARTMENT", root)
    const all = permissionCatalog.map((item) => item.code)
    const business = all.filter((code) => !code.startsWith("system:"))
    const definitions = [
      { code: "admin", name: "机构管理员", permissions: all },
      {
        code: "supervisor",
        name: "项目督导",
        permissions: [...business, "system:view", "system:user:view"],
      },
      {
        code: "leader",
        name: "团队负责人",
        permissions: [
          ...business.filter((code) => code !== "analysis:view"),
          "system:view",
          "system:user:view",
        ],
      },
      {
        code: "social",
        name: "社工",
        permissions: ["service:archive:view", "knowledge:view", "knowledge:document:download"],
      },
      { code: "intern", name: "实习生", permissions: ["knowledge:view"] },
    ]
    const roleIds = new Map<string, number>()
    for (const definition of definitions) {
      let [role] = await tx.select().from(s.roles).where(eq(s.roles.code, definition.code))
      if (!role) {
        const [result] = await tx
          .insert(s.roles)
          .values({ code: definition.code, name: definition.name, builtIn: 1 })
        ;[role] = await tx.select().from(s.roles).where(eq(s.roles.id, result.insertId))
        await tx
          .insert(s.rolePermissions)
          .values(
            definition.permissions.map((permissionCode) => ({ roleId: role.id, permissionCode })),
          )
      }
      roleIds.set(role.code, role.id)
    }
    /** 按账号复用或新增种子人员；新增时设置角色及范围，管理员账号另校验已有身份。 */
    const person = async (
      username: string,
      name: string,
      role: string,
      orgId: number,
      supervisorId: number | null,
      scope: typeof s.users.$inferInsert.dataScope,
      hash: string,
      positionCode: string,
    ) => {
      const [existing] = await tx.select().from(s.users).where(eq(s.users.username, username))
      if (existing) {
        if (role === "admin") {
          const memberships = await tx
            .select()
            .from(s.userRoles)
            .where(eq(s.userRoles.userId, existing.id))
          if (
            existing.status !== "ACTIVE" ||
            !memberships.some((row) => row.roleId === roleIds.get("admin"))
          )
            throw new Error("初始化账号已被其他人员占用，请指定新的管理员账号")
        }
        return existing.id
      }
      const [result] = await tx.insert(s.users).values({
        username,
        name,
        passwordHash: hash,
        phone: "13800000000",
        arrivalDate: "2026-10-01",
        major: "社会工作",
        proposedPosition: name,
        education: "本科",
        politicalStatus: "群众",
        orgId,
        positionCode,
        supervisorId,
        dataScope: scope,
        status: "ACTIVE",
      })
      await tx.insert(s.userRoles).values({ userId: result.insertId, roleId: roleIds.get(role)! })
      if (scope === "SUBTREE")
        await tx.insert(s.userManagedOrgs).values({ userId: result.insertId, orgId })
      return result.insertId
    }
    const admin = await person(
      input.adminUsername,
      "机构管理员",
      "admin",
      root,
      null,
      "ALL",
      adminHash,
      "position-12",
    )
    if (demoHash) {
      const department = await org("demo-service", "演示服务一部", "DEPARTMENT", root)
      const other = await org("demo-other", "演示服务二部", "DEPARTMENT", root)
      const teamA = await org("demo-team-a", "演示团队甲", "TEAM", department)
      const teamB = await org("demo-team-b", "演示团队乙", "TEAM", other)
      const supervisor = await person(
        "supervisor",
        "演示项目督导",
        "supervisor",
        root,
        admin,
        "ALL",
        demoHash,
        "position-5",
      )
      await person(
        "department",
        "演示部门主管",
        "supervisor",
        department,
        supervisor,
        "SUBTREE",
        demoHash,
        "position-9",
      )
      const leader = await person(
        "leader",
        "演示团队负责人",
        "leader",
        teamA,
        supervisor,
        "TEAM",
        demoHash,
        "position-4",
      )
      await person(
        "social",
        "演示一线社工",
        "social",
        teamA,
        leader,
        "TEAM",
        demoHash,
        "position-3",
      )
      await person("intern", "演示实习生", "intern", teamA, leader, "SELF", demoHash, "position-1")
      await person(
        "other_social",
        "演示其他团队社工",
        "social",
        teamB,
        supervisor,
        "TEAM",
        demoHash,
        "position-3",
      )
      const [pending] = await tx.select().from(s.users).where(eq(s.users.username, "pending"))
      if (!pending)
        await tx.insert(s.users).values({
          username: "pending",
          name: "演示待审核人员",
          passwordHash: demoHash,
          phone: "13800000001",
          arrivalDate: "2026-10-01",
          major: "社会工作",
          proposedPosition: "社工",
          education: "本科",
          politicalStatus: "群众",
        })
    }
  })
}
