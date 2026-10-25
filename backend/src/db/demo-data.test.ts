import { describe, expect, test } from "bun:test"
import { getTableName } from "drizzle-orm"
import { assertDemoTarget, demoResetTables } from "./demo-data"

describe("测试数据重建边界", () => {
  const valid = {
    host: "127.0.0.1",
    database: "swms",
    actualDatabase: "swms",
    confirmedDatabase: "swms",
    nodeEnv: "development",
    reset: true,
    tables: [...demoResetTables.map((table) => getTableName(table)), "__drizzle_migrations"],
  }
  test("清理清单包含31张数据表并保留迁移记录", () => {
    expect(demoResetTables).toHaveLength(31)
    expect(new Set(valid.tables).size).toBe(32)
    expect(demoResetTables.map((table) => getTableName(table))).not.toContain(
      "__drizzle_migrations",
    )
    expect(() => assertDemoTarget(valid)).not.toThrow()
  })
  test("拒绝未确认、远程、生产、连接不符及未知表", () => {
    for (const patch of [
      { reset: false },
      { confirmedDatabase: undefined },
      { host: "192.0.2.1" },
      { nodeEnv: "production" },
      { actualDatabase: "other" },
      { database: "production", confirmedDatabase: "production", actualDatabase: "production" },
      { tables: [...valid.tables, "unknown_table"] },
      { tables: valid.tables.slice(1) },
    ])
      expect(() => assertDemoTarget({ ...valid, ...patch })).toThrow()
  })
})
