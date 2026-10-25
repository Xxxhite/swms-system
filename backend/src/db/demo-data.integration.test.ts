import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import { mkdtemp, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as schema from "./schema"
import { assertDemoTarget, rebuildDemoData } from "./demo-data"
import type { Database } from "@/modules/identity/identity.repository"
import { IdentityRepository } from "@/modules/identity/identity.repository"
import { IdentityService } from "@/modules/identity/identity.service"
import { ProjectRepository } from "@/modules/project/project.repository"
import { ProjectService } from "@/modules/project/project.service"
import { ServiceService } from "@/modules/service/service.service"
import { verifyPassword } from "@/utils/password"

const name = process.env.DEMO_TEST_DB_NAME
describe.skipIf(!name)("独立库完整测试数据重建", () => {
  let pool: mysql.Pool
  let database: Database
  let directory: string
  beforeAll(async () => {
    if (
      !name?.startsWith("swms_test_") ||
      name === process.env.DB_NAME ||
      process.env.DEMO_TEST_RESET !== "1"
    )
      throw new Error("仅显式允许的swms_test_独立库")
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: name,
      timezone: "Z",
    })
    const [actual] = await pool.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS name")
    const [tables] = await pool.query<mysql.RowDataPacket[]>("SHOW TABLES")
    assertDemoTarget({
      host: process.env.DB_HOST,
      database: name,
      actualDatabase: actual[0]!.name,
      confirmedDatabase: name,
      nodeEnv: "test",
      reset: true,
      tables: tables.map((r) => String(Object.values(r)[0])),
    })
    database = drizzle(pool, { schema, mode: "default" })
    directory = await mkdtemp(join(tmpdir(), "swms-demo-fixtures-"))
  })
  afterAll(async () => {
    await pool?.end()
  })
  const password = "DemoFixture_Test_2026"
  test("完整资料、业务状态、权限及新旧ID隔离，迁移记录保留", async () => {
    const old = await database.select().from(schema.users)
    const [before] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM __drizzle_migrations",
    )
    const result = await rebuildDemoData(database, {
      adminPassword: password,
      demoPassword: password,
      uploadDir: directory,
    })
    expect(result.counts.users).toBe(24)
    expect(result.counts.organizations).toBe(8)
    expect(result.counts.contract_files).toBe(8)
    expect(result.counts.service_records).toBe(60)
    expect(result.counts.approval_instances).toBe(56)
    expect(result.counts.projects).toBe(0)
    expect(result.counts.monthly_reports).toBe(0)
    expect(Math.min(...result.accounts.map((u) => u.id))).toBeGreaterThan(
      Math.max(...old.map((u) => u.id), 0),
    )
    expect(new Set(result.accounts.map((u) => u.positionCode).filter(Boolean)).size).toBe(11)
    expect(new Set(result.accounts.map((u) => u.status)).size).toBe(5)
    expect(new Set(result.accounts.map((u) => u.dataScope)).size).toBe(4)
    expect(result.accounts.every((u) => !Object.hasOwn(u, "passwordHash"))).toBe(true)
    const users = await database.select().from(schema.users)
    for (const u of users) expect(await verifyPassword(password, u.passwordHash)).toBe(true)
    const identities = new IdentityService(new IdentityRepository(database))
    const services = new ServiceService(new ProjectRepository(database))
    const projects = new ProjectService(new ProjectRepository(database))
    for (const username of ["leader", "other_social", "assistant", "social_d"]) {
      const actor = await identities.actor(users.find((u) => u.username === username)!.id)
      const context = await services.context(actor)
      expect(context.fixedProject).toBe(true)
      expect(context.projects).toHaveLength(1)
      expect(context.slots).toHaveLength(4)
      expect(context.slots.every((slot) => slot.teamId === actor.profile.teamId)).toBe(true)
    }
    const manager = await identities.actor(users.find((u) => u.username === "project_manager")!.id)
    expect((await services.context(manager)).projects).toHaveLength(2)
    expect((await projects.list(manager, { page: 1, pageSize: 100 })).total).toBe(3)
    const statusCounts = (await database.select().from(schema.monthlyReports)).reduce<
      Record<string, number>
    >((r, row) => {
      r[row.status] = (r[row.status] ?? 0) + 1
      return r
    }, {})
    expect(statusCounts).toEqual({ SUBMITTED: 23, IN_REVIEW: 12, DRAFT: 12, REJECTED: 12, VOID: 1 })
    const [after] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM __drizzle_migrations",
    )
    expect(after[0]!.n).toBe(before[0]!.n)
  }, 120000)
  test("附件创建失败时，清理与新数据均回滚", async () => {
    const users = await database.select().from(schema.users)
    const blocker = join(directory, "not-a-directory")
    await Bun.write(blocker, "test")
    try {
      await expect(
        rebuildDemoData(database, {
          adminPassword: password,
          demoPassword: password,
          uploadDir: blocker,
        }),
      ).rejects.toThrow()
      expect((await database.select().from(schema.users)).map((u) => u.id)).toEqual(
        users.map((u) => u.id),
      )
      expect((await database.select().from(schema.projects)).length).toBe(4)
      const admin = users.find((u) => u.username === "admin")!
      expect(
        (await database.select().from(schema.users).where(eq(schema.users.id, admin.id)))[0]!
          .supervisorId,
      ).toBe(admin.supervisorId)
    } finally {
      await unlink(blocker)
    }
  }, 120000)
})
