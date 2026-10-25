import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { RowDataPacket } from "mysql2/promise"
import { db, pool } from "./index"
import { assertDemoTarget, rebuildDemoData } from "./demo-data"
import { env } from "@/utils/env"
import { positions } from "@/modules/identity/identity.constants"

/** 仅显式本机重建使用，不进行备份，不改结构或重置ID。 */
try {
  const confirmedDatabase = process.argv.find((arg) => arg.startsWith("--database="))?.slice(11)
  const [actual] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name")
  const [tables] = await pool.query<RowDataPacket[]>("SHOW TABLES")
  assertDemoTarget({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    actualDatabase: actual[0]!.name as string,
    confirmedDatabase,
    nodeEnv: env.nodeEnv,
    reset: process.argv.includes("--reset"),
    tables: tables.map((row) => String(Object.values(row)[0])),
  })
  const adminPassword =
    process.env.DEMO_DATA_ADMIN_PASSWORD ||
    `SwmsAdmin_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`
  const demoPassword =
    process.env.DEMO_DATA_PASSWORD ||
    `SwmsDemo_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`
  if ([adminPassword, demoPassword].some((value) => /[\r\n]/.test(value)))
    throw new Error("测试密码不可包含换行")
  const output = resolve(import.meta.dir, "../../../.docs/validation/demo-data")
  await mkdir(output, { recursive: true })
  const result = await rebuildDemoData(db, {
    adminPassword,
    demoPassword,
    uploadDir: env.uploadDir,
  })
  const credentials = {
    createdAt: result.createdAt,
    database: confirmedDatabase,
    adminPassword,
    demoPassword,
    note: "仅用于本机虚构测试账号；mock密码仍为123456",
  }
  await writeFile(resolve(output, "credentials.json"), `${JSON.stringify(credentials, null, 2)}\n`)
  await writeFile(
    resolve(output, "personnel.json"),
    `${JSON.stringify(result.accounts, null, 2)}\n`,
  )
  await writeFile(
    resolve(output, "summary.json"),
    `${JSON.stringify({ database: confirmedDatabase, createdAt: result.createdAt, counts: result.counts }, null, 2)}\n`,
  )
  const directory = [
    "# 本机测试账号清单",
    "",
    `最后更新：${result.createdAt.slice(0, 10)}`,
    "",
    "全为虚构测试资料。admin使用管理员测试密码，其他账号使用演示测试密码，见[本地凭据](credentials.json)。完整人员字段见[人员资料](personnel.json)。旧账号已重建，旧登录会话失效。",
    "",
    "| 账号 | 姓名 | 岗位 | 状态 | 直接主管 | 数据范围 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...result.accounts.map(
      (user) =>
        `| ${user.username} | ${user.name} | ${positions.find((p) => p.code === user.positionCode)?.name ?? "待审核分配"} | ${user.status} | ${result.accounts.find((u) => u.id === user.supervisorId)?.username ?? "无"} | ${user.dataScope} |`,
    ),
    "",
    "disabled、left用于停用／离职拦截，无法登录；pending、rejected登录后进入申请状态页。开发admin可全局测试，其他人员按岗位、团队及项目负责关系授权。",
    "",
  ]
  await writeFile(resolve(output, "ACCOUNTS.md"), directory.join("\n"))
  if (process.argv.includes("--configure-login")) {
    const path = resolve(import.meta.dir, "../../../frontend/.env.local")
    let content = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
      return ""
    })
    for (const [key, value] of [
      ["VITE_DEV_ADMIN_PASSWORD", adminPassword],
      ["VITE_DEV_DEMO_PASSWORD", demoPassword],
    ]) {
      const line = `${key}=${JSON.stringify(value).replaceAll("$", "\\$")}`
      const pattern = new RegExp(`^${key}=.*$`, "m")
      content = pattern.test(content)
        ? content.replace(pattern, () => line)
        : `${content.trimEnd()}\n${line}\n`
    }
    await writeFile(path, `${content.trim()}\n`)
  }
  console.log(
    JSON.stringify({
      database: confirmedDatabase,
      counts: result.counts,
      directory: ".docs/validation/demo-data/ACCOUNTS.md",
      loginConfigured: process.argv.includes("--configure-login"),
    }),
  )
} finally {
  await pool.end()
}
