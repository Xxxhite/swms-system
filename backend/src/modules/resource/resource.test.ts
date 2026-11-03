import { describe, expect, test } from "bun:test"
import { relationship } from "./resource.service"
describe("合作关系派生", () => {
  const date = "2026-11-03"
  test("未来协议、历史结束与正在履约优先级", () => {
    const future = { status: "AGREED" as const, startDate: "2099-01-01", endDate: "2099-12-31" }
    const ended = { status: "ENDED" as const, startDate: "2020-01-01", endDate: "2020-12-31" }
    const current = { status: "AGREED" as const, startDate: "2026-01-01", endDate: "2027-01-01" }
    expect(relationship([future], date)).toBe("POTENTIAL")
    expect(relationship([future, ended], date)).toBe("HISTORICAL")
    expect(relationship([future, ended, current], date)).toBe("CURRENT")
    expect(relationship([{ ...current, endDate: date }], date)).toBe("CURRENT")
  })
  test("未曾履约的终止事项保持潜在，有实际合作历史才归历史", () => {
    const terminated = {
      status: "TERMINATED" as const,
      startDate: "2020-01-01",
      endDate: "2020-12-31",
      wasEffective: 0,
    }
    expect(relationship([terminated], date)).toBe("POTENTIAL")
    expect(relationship([{ ...terminated, wasEffective: 1 }], date)).toBe("HISTORICAL")
  })
})
