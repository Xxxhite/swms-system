import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Elysia } from "elysia"
import mysql from "mysql2/promise"
import { drizzle } from "drizzle-orm/mysql2"
import { migrate } from "drizzle-orm/mysql2/migrator"
import { eq } from "drizzle-orm"
import * as schema from "@/db/schema"
import { errorHandler } from "@/plugins/error-handler"
import { createAuthRoutes } from "@/modules/auth/auth.route"
import { AuthRepository } from "@/modules/auth/auth.repository"
import { AuthService } from "@/modules/auth/auth.service"
import { createSystemRoutes } from "@/modules/system/system.route"
import { createIdentityRoutes } from "./identity.route"
import { IdentityRepository, type Database } from "./identity.repository"
import { IdentityService } from "./identity.service"
import { seedIdentity } from "./identity.seed.repository"

const testDatabase = process.env.TEST_DB_NAME
const demoPassword = "IdentityTest_2026"
let pool: mysql.Pool | undefined
let database: Database
let repository: IdentityRepository
let handle: (request: Request) => Response | Promise<Response>
let adminToken = ""
let pendingToken = ""
let registeredId = 0

async function request(path: string, method = "GET", token = "", body?: unknown) {
  const response = await handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
  return { status: response.status, body: await response.json() }
}
async function login(username: string, password = demoPassword) {
  const response = await request("/auth/login", "POST", "", { username, password })
  expect(response.body.code).toBe(0)
  return response.body.data.token as string
}
async function user(username: string) {
  const result = await repository.findUsername(username)
  if (!result) throw new Error(`Missing fixture: ${username}`)
  return result
}

describe.skipIf(!testDatabase)("独立 MySQL 身份集成", () => {
  beforeAll(async () => {
    if (!testDatabase?.startsWith("swms_test_") || testDatabase === process.env.DB_NAME)
      throw new Error("集成测试必须使用 swms_test_ 开头的独立库")
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: testDatabase,
      timezone: "Z",
      connectionLimit: 5,
    })
    const [actual] = await pool.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS db")
    if (actual[0].db !== testDatabase) throw new Error("测试连接目标异常")
    const [tables] = await pool.query<mysql.RowDataPacket[]>("SHOW TABLES")
    if (tables.length) {
      if (process.env.TEST_DB_RESET !== "1")
        throw new Error("测试库非空；确认可清理后设置 TEST_DB_RESET=1")
      const allowed = [
        "audit_logs",
        "user_managed_orgs",
        "user_extra_permissions",
        "user_roles",
        "role_permissions",
        "users",
        "roles",
        "permissions",
        "organizations",
        "__drizzle_migrations",
      ]
      const existing = tables.map((row) => String(Object.values(row)[0]))
      if (existing.some((name) => !allowed.includes(name)))
        throw new Error("测试库含未知表，拒绝清理")
      const connection = await pool.getConnection()
      try {
        await connection.query("SET FOREIGN_KEY_CHECKS=0")
        for (const name of allowed) await connection.query(`DROP TABLE IF EXISTS \`${name}\``)
      } finally {
        await connection.query("SET FOREIGN_KEY_CHECKS=1")
        connection.release()
      }
    }
    database = drizzle(pool, { schema, mode: "default" })
    await migrate(database, { migrationsFolder: "./drizzle" })
    await seedIdentity(database, {
      adminUsername: "admin",
      adminPassword: demoPassword,
      demoPassword,
    })
    repository = new IdentityRepository(database)
    const identities = new IdentityService(repository)
    const auth = new AuthService(new AuthRepository(repository), identities)
    const app = new Elysia()
      .use(errorHandler)
      .group("/api", (api) =>
        api.use([
          createAuthRoutes(auth),
          createIdentityRoutes(identities),
          createSystemRoutes(identities),
        ]),
      )
      .compile()
    handle = app.handle.bind(app)
    adminToken = await login("admin")
  }, 60000)
  afterAll(async () => {
    await pool?.end()
  })

  test("真实注册、哈希和唯一约束，受限账号无法访问管理数据", async () => {
    const input = {
      username: "registered",
      password: demoPassword,
      name: "集成测试社工",
      phone: "13800000009",
      arrivalDate: "2026-10-01",
      major: "社会工作",
      proposedPosition: "社工",
      education: "本科",
      politicalStatus: "群众",
    }
    expect(
      (await request("/auth/register", "POST", "", { ...input, password: "short" })).body.code,
    ).toBe(1000)
    const created = await request("/auth/register", "POST", "", input)
    expect(created.body.code).toBe(0)
    registeredId = created.body.data.id
    const stored = await user("registered")
    expect(stored.passwordHash).toStartWith("$argon2id$")
    expect(stored.passwordHash).not.toBe(demoPassword)
    expect((await request("/auth/register", "POST", "", input)).body.code).toBe(4000)
    pendingToken = await login("registered")
    const profile = await request("/auth/profile", "GET", pendingToken)
    expect(profile.body.data.permissions).toEqual([])
    expect(profile.body.data.roles).toEqual([])
    expect(profile.body.data.passwordHash).toBeUndefined()
    for (const path of ["/users", "/roles", "/orgs/tree", "/system/logs"])
      expect((await request(path, "GET", pendingToken)).body.code).toBe(2003)
  })

  test("审核驳回、资料修改、重提和过期版本校验", async () => {
    const target = await user("registered")
    const rejected = await request(`/registrations/${target.id}/reject`, "POST", adminToken, {
      version: target.version,
      comment: "请补充联系方式",
    })
    expect(rejected.body.code).toBe(0)
    const updated = await request("/auth/profile", "PUT", pendingToken, {
      version: rejected.body.data.version,
      phone: "13800000008",
    })
    expect(updated.body.code).toBe(0)
    expect(
      (
        await request("/auth/profile", "PUT", pendingToken, {
          version: target.version,
          phone: "13800000007",
        })
      ).body.code,
    ).toBe(4000)
    expect(
      (
        await request("/auth/registration/submit", "POST", pendingToken, {
          version: updated.body.data.version,
        })
      ).body.code,
    ).toBe(0)
    expect((await user("registered")).status).toBe("PENDING")
  })

  test("并发批准只保留一个账号，批准后受限凭证失效", async () => {
    const target = await user("registered")
    const state = await repository.state()
    const team = state.orgs.find((org) => org.code === "demo-team-a")!
    const role = state.roles.find((item) => item.code === "social")!
    const input = {
      version: target.version,
      orgId: team.id,
      positionCode: "position-3",
      supervisorId: (await user("leader")).id,
      roleIds: [role.id],
      extraPermissions: [],
      dataScope: "TEAM",
      managedOrgIds: [],
    }
    const results = await Promise.all([
      request(`/registrations/${target.id}/approve`, "POST", adminToken, input),
      request(`/registrations/${target.id}/approve`, "POST", adminToken, input),
    ])
    expect(results.map((result) => result.body.code)).toEqual([0, 0])
    expect(
      (await database.select().from(schema.users).where(eq(schema.users.username, "registered")))
        .length,
    ).toBe(1)
    expect((await request("/auth/profile", "GET", pendingToken)).body.code).toBe(2001)
    expect(
      (
        await request(`/registrations/${target.id}/approve`, "POST", adminToken, {
          ...input,
          dataScope: "ALL",
        })
      ).body.code,
    ).toBe(4000)
    expect(
      (await request("/auth/profile", "GET", await login("registered"))).body.data.status,
    ).toBe("ACTIVE")
  })

  test("SELF、TEAM、SUBTREE、ALL 在 SQL 查询和详情上隔离", async () => {
    const intern = await user("intern")
    const state = await repository.state()
    const internRole = state.roles.find((role) => role.code === "intern")!
    expect(
      (
        await request(`/users/${intern.id}/authorization`, "PUT", adminToken, {
          version: intern.version,
          roleIds: [internRole.id],
          extraPermissions: ["system:user:view"],
          dataScope: "SELF",
          managedOrgIds: [],
        })
      ).body.code,
    ).toBe(0)
    const selfToken = await login("intern")
    const self = await request("/users", "GET", selfToken)
    expect(self.body.data.list.map((item: { username: string }) => item.username)).toEqual([
      "intern",
    ])
    expect((await request(`/users/${registeredId}`, "GET", selfToken)).body.code).toBe(2003)
    const team = await request("/users", "GET", await login("leader"))
    expect(
      team.body.data.list.some((item: { username: string }) => item.username === "registered"),
    ).toBe(true)
    expect(
      team.body.data.list.some((item: { username: string }) => item.username === "other_social"),
    ).toBe(false)
    const subtree = await request("/users", "GET", await login("department"))
    expect(
      subtree.body.data.list.some((item: { username: string }) => item.username === "leader"),
    ).toBe(true)
    expect(
      subtree.body.data.list.some((item: { username: string }) => item.username === "other_social"),
    ).toBe(false)
    const all = await request("/users", "GET", adminToken)
    expect(
      all.body.data.list.some((item: { username: string }) => item.username === "other_social"),
    ).toBe(true)
  })

  test("主管只读权限不能修改人员或角色，空团队范围不泄露", async () => {
    const leaderToken = await login("leader")
    const social = await user("social")
    expect(
      (
        await request(`/users/${social.id}/status`, "PUT", leaderToken, {
          version: social.version,
          status: "DISABLED",
        })
      ).body.code,
    ).toBe(2003)
    expect((await request("/roles", "GET", leaderToken)).body.code).toBe(2003)
    const intern = await user("intern")
    const state = await repository.state()
    expect(
      (
        await request(`/users/${intern.id}/authorization`, "PUT", adminToken, {
          version: intern.version,
          roleIds: [state.roles.find((role) => role.code === "intern")!.id],
          extraPermissions: ["system:user:view"],
          dataScope: "TEAM",
          managedOrgIds: [],
        })
      ).body.code,
    ).toBe(0)
    const freshIntern = await user("intern")
    expect(
      (
        await request(`/users/${intern.id}`, "PUT", adminToken, {
          version: freshIntern.version,
          orgId: state.orgs.find((org) => org.code === "headquarters")!.id,
          positionCode: "position-1",
          supervisorId: null,
          name: intern.name,
          phone: intern.phone,
        })
      ).body.code,
    ).toBe(0)
    expect((await request("/users", "GET", await login("intern"))).body.data.total).toBe(0)
    const current = await user("intern")
    expect(
      (
        await request(`/users/${intern.id}`, "PUT", adminToken, {
          version: current.version,
          orgId: state.orgs.find((org) => org.code === "unassigned")!.id,
          positionCode: "position-1",
          supervisorId: null,
          name: current.name,
          phone: current.phone,
        })
      ).body.code,
    ).toBe(0)
    const unassigned = await login("intern")
    expect((await request("/users", "GET", unassigned)).body.code).toBe(2003)
    expect((await request("/auth/profile", "GET", unassigned)).body.data.dataScope).toBe("SELF")
  })

  test("组织循环、主管循环、引用删除与最后管理员受保护", async () => {
    const state = await repository.state()
    const root = state.orgs.find((org) => org.code === "headquarters")!
    const team = state.orgs.find((org) => org.code === "demo-team-a")!
    expect(
      (
        await request(`/orgs/${root.id}`, "PUT", adminToken, {
          code: root.code,
          name: root.name,
          type: root.type,
          parentId: team.id,
          status: "ACTIVE",
          sortOrder: 0,
          version: root.version,
        })
      ).body.code,
    ).toBe(4000)
    expect(
      (await request(`/orgs/${team.id}?version=${team.version}`, "DELETE", adminToken)).body.code,
    ).toBe(4000)
    const leader = await user("leader")
    expect(
      (
        await request(`/users/${leader.id}`, "PUT", adminToken, {
          version: leader.version,
          orgId: leader.orgId,
          positionCode: leader.positionCode,
          supervisorId: (await user("social")).id,
          name: leader.name,
          phone: leader.phone,
        })
      ).body.code,
    ).toBe(4000)
    const admin = await user("admin")
    expect(
      (
        await request(`/users/${admin.id}/status`, "PUT", adminToken, {
          version: admin.version,
          status: "DISABLED",
        })
      ).body.code,
    ).toBe(4000)
    expect(
      (
        await request(`/users/${admin.id}/authorization`, "PUT", adminToken, {
          version: admin.version,
          roleIds: [],
          extraPermissions: [],
          dataScope: "ALL",
          managedOrgIds: [],
        })
      ).body.code,
    ).toBe(4000)
  })

  test("角色权限更新立即生效，内建管理员权限不能删减", async () => {
    const state = await repository.state()
    const supervisor = state.roles.find((role) => role.code === "supervisor")!
    const token = await login("department")
    expect(
      (
        await request(`/roles/${supervisor.id}/permissions`, "PUT", adminToken, {
          version: supervisor.version,
          permissionCodes: ["knowledge:view"],
        })
      ).body.code,
    ).toBe(0)
    expect((await request("/users", "GET", token)).body.code).toBe(2003)
    const admin = state.roles.find((role) => role.code === "admin")!
    expect(
      (
        await request(`/roles/${admin.id}/permissions`, "PUT", adminToken, {
          version: admin.version,
          permissionCodes: [],
        })
      ).body.code,
    ).toBe(4000)
    const role = (await repository.state()).roles.find((item) => item.id === supervisor.id)!
    expect(
      (
        await request(`/roles/${role.id}/permissions`, "PUT", adminToken, {
          version: role.version,
          permissionCodes: state.rolePermissions
            .filter((row) => row.roleId === role.id)
            .map((row) => row.permissionCode),
        })
      ).body.code,
    ).toBe(0)
  })

  test("停用、重启用及改密撤销旧版本的所有凭证", async () => {
    const tokenA = await login("registered")
    const tokenB = await login("registered")
    const target = await user("registered")
    expect(
      (
        await request(`/users/${target.id}/status`, "PUT", adminToken, {
          version: target.version,
          status: "DISABLED",
        })
      ).body.code,
    ).toBe(0)
    expect((await request("/auth/profile", "GET", tokenA)).body.code).toBe(2001)
    expect(
      (await request("/auth/login", "POST", "", { username: "registered", password: demoPassword }))
        .body.code,
    ).toBe(2003)
    const disabled = await user("registered")
    expect(
      (
        await request(`/users/${target.id}/status`, "PUT", adminToken, {
          version: disabled.version,
          status: "ACTIVE",
        })
      ).body.code,
    ).toBe(0)
    expect((await request("/auth/profile", "GET", tokenB)).body.code).toBe(2001)
    const current = await login("registered")
    expect(
      (
        await request("/auth/password", "PUT", current, {
          oldPassword: demoPassword,
          newPassword: "ChangedTest_2026",
        })
      ).body.code,
    ).toBe(0)
    expect((await request("/auth/profile", "GET", current)).body.code).toBe(2001)
    expect(
      (await request("/auth/profile", "GET", await login("registered", "ChangedTest_2026"))).body
        .code,
    ).toBe(0)
  })

  test("组织及角色的创建、更新、引用保护和删除", async () => {
    const created = await request("/orgs", "POST", adminToken, {
      code: "test-empty",
      name: "测试空部门",
      parentId: null,
      type: "DEPARTMENT",
      status: "ACTIVE",
      sortOrder: 0,
    })
    expect(created.body.code).toBe(0)
    const id = created.body.data.id
    expect(
      (
        await request(`/orgs/${id}`, "PUT", adminToken, {
          code: "test-empty",
          name: "测试修改部门",
          parentId: null,
          type: "DEPARTMENT",
          status: "ACTIVE",
          sortOrder: 1,
          version: 1,
        })
      ).body.code,
    ).toBe(0)
    expect((await request(`/orgs/${id}?version=2`, "DELETE", adminToken)).body.code).toBe(0)
    const role = await request("/roles", "POST", adminToken, {
      code: "test-role",
      name: "测试角色",
      description: "测试",
      status: "ACTIVE",
    })
    expect(role.body.code).toBe(0)
    expect(
      (
        await request(`/roles/${role.body.data.id}/permissions`, "PUT", adminToken, {
          version: 1,
          permissionCodes: ["unknown:permission"],
        })
      ).body.code,
    ).toBe(1000)
    expect(
      (await request(`/roles/${role.body.data.id}?version=1`, "DELETE", adminToken)).body.code,
    ).toBe(0)
  })

  test("审核日志包含过程而不含密码、凭证；错误参数不回显秘密", async () => {
    const logs = await request("/system/logs?pageSize=100", "GET", adminToken)
    expect(logs.body.code).toBe(0)
    const serialized = JSON.stringify(logs.body)
    expect(serialized).toContain("reject-registration")
    expect(serialized).toContain("approve-registration")
    expect(serialized).not.toContain("passwordHash")
    expect(serialized).not.toContain(demoPassword)
    expect(serialized).not.toContain(adminToken)
    expect(
      (await request("/system/logs?dateFrom=2026-10-20&dateTo=2026-10-01", "GET", adminToken)).body
        .code,
    ).toBe(1000)
    const invalid = await request("/auth/register", "POST", "", { password: "SuperSecretInvalid" })
    expect(JSON.stringify(invalid.body)).not.toContain("SuperSecretInvalid")
  })

  test("日志显示当前姓名，姓名筛选保留同名及离职停用人员并正确分页", async () => {
    const first = await user("intern")
    const second = await user("other_social")
    const name = "日志同名%_人员"
    try {
      await database
        .update(schema.users)
        .set({ name, status: "LEFT" })
        .where(eq(schema.users.id, first.id))
      await database
        .update(schema.users)
        .set({ name, status: "DISABLED" })
        .where(eq(schema.users.id, second.id))
      await database.insert(schema.auditLogs).values([
        { actorId: first.id, action: "actor-name-test", entityType: "user", entityId: first.id },
        { actorId: second.id, action: "actor-name-test", entityType: "user", entityId: second.id },
        { actorId: null, action: "actor-name-test", entityType: "user", entityId: null },
      ])
      const find = (actorName: string, page = 1, pageSize = 100) =>
        request(
          `/system/logs?${new URLSearchParams({ actorName, page: String(page), pageSize: String(pageSize), action: "actor-name-test" })}`,
          "GET",
          adminToken,
        )

      const exact = await find(name)
      expect(exact.body.code).toBe(0)
      expect(exact.body.data.total).toBe(2)
      expect(exact.body.data.list.map((row: { actorId: number }) => row.actorId).sort()).toEqual(
        [first.id, second.id].sort(),
      )
      expect(
        exact.body.data.list.every((row: { actorName: string }) => row.actorName === name),
      ).toBe(true)
      expect((await find("同名")).body.data.total).toBe(2)
      expect((await find(`  ${name}  `)).body.data.total).toBe(2)
      expect((await find("%_")).body.data.total).toBe(2)
      expect((await find("不存在的操作人")).body.data.total).toBe(0)

      const pageOne = (await find("同名", 1, 1)).body.data
      const pageTwo = (await find("同名", 2, 1)).body.data
      expect(pageOne.total).toBe(2)
      expect(pageOne.list).toHaveLength(1)
      expect(pageTwo.total).toBe(2)
      expect(pageTwo.list).toHaveLength(1)
      expect(pageOne.list[0].id).not.toBe(pageTwo.list[0].id)

      const reset = (await find("")).body.data
      expect(reset.total).toBe(3)
      expect(
        reset.list.some(
          (row: { actorId: number | null; actorName: string | null }) =>
            row.actorId === null && row.actorName === null,
        ),
      ).toBe(true)
      expect((await find("  ")).body.data.total).toBe(3)
      expect(
        (await request(`/system/logs?actorName=${"a".repeat(51)}`, "GET", adminToken)).body.code,
      ).toBe(1000)
    } finally {
      // 只恢复独立测试库中的人员夹具，不影响后续用例的账号状态。
      for (const original of [first, second])
        await database
          .update(schema.users)
          .set({ name: original.name, status: original.status })
          .where(eq(schema.users.id, original.id))
    }
  })

  test("伪造凭证、非整数分页及字典原型键被拒绝", async () => {
    expect((await request("/auth/profile", "GET", "forged.token.value")).body.code).toBe(2001)
    expect((await request("/users", "GET")).body.code).toBe(2000)
    expect((await request("/users?page=1.5", "GET", adminToken)).body.code).toBe(1000)
    expect((await request("/users?pageSize=101", "GET", adminToken)).body.code).toBe(1000)
    expect((await request("/dictionaries/constructor", "GET", adminToken)).body.code).toBe(3000)
    expect((await request("/dictionaries/toString", "GET", adminToken)).body.code).toBe(3000)
  })
})
