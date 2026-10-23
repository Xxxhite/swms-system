import { describe, expect, test } from "bun:test"
import { sortRows, sortDecimal } from "./list-sort"

describe("授权结果排序", () => {
  const rows = [
    { id: 1, time: new Date("2026-01-01"), amount: "10.00", name: "张三" },
    { id: 2, time: new Date("2026-02-01"), amount: "2.00", name: "李四" },
    { id: 3, time: new Date("2026-02-01"), amount: null, name: "王五" },
  ]
  const fields = {
    id: (r: (typeof rows)[number]) => r.id,
    time: (r: (typeof rows)[number]) => r.time,
    amount: (r: (typeof rows)[number]) => sortDecimal(r.amount),
    name: (r: (typeof rows)[number]) => r.name,
  }
  const defaults = [
    ["time", "desc"],
    ["id", "desc"],
  ] as const
  test("新记录优先，同一时间以 ID 补序，且不改变原数组", () => {
    expect(sortRows(rows, {}, fields, defaults).map((r) => r.id)).toEqual([3, 2, 1])
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3])
  })
  test("数量比较精确，升降序都把空值放最后，中文名称按拼音", () => {
    expect(
      sortRows(rows, { sortBy: "amount", sortOrder: "asc" }, fields, defaults).map((r) => r.id),
    ).toEqual([2, 1, 3])
    expect(
      sortRows(rows, { sortBy: "amount", sortOrder: "desc" }, fields, defaults).map((r) => r.id),
    ).toEqual([1, 2, 3])
    expect(
      sortRows(rows, { sortBy: "name", sortOrder: "asc" }, fields, defaults).map((r) => r.id),
    ).toEqual([2, 3, 1])
    expect(sortDecimal("9007199254740992.01")! - sortDecimal("9007199254740992.00")!).toBe(1n)
  })
  test("拒绝未知字段、原型键、不完整参数与非法方向", () => {
    for (const sortBy of [
      "constructor",
      "__proto__",
      "passwordHash",
      "time desc; drop table users",
    ])
      expect(() => sortRows(rows, { sortBy, sortOrder: "asc" }, fields, defaults)).toThrow(
        "不支持此排序字段",
      )
    expect(() => sortRows(rows, { sortBy: "time" }, fields, defaults)).toThrow()
    expect(() => sortRows(rows, { sortOrder: "asc" }, fields, defaults)).toThrow()
  })
})
