import { describe, expect, test } from "bun:test"
import {
  monthlyPeriods,
  validatePeriods,
  occurrences,
  overlaps,
  taskState,
  businessDate,
} from "./task-calendar"
describe("B2计划与任务规则", () => {
  test("精确均分、合同相交月与尾差", () => {
    const p = monthlyPeriods("2026-11-15", "2026-12-02", "10.01")
    expect(p).toEqual([
      { startDate: "2026-11-15", endDate: "2026-11-30", targetValue: "5.00" },
      { startDate: "2026-12-01", endDate: "2026-12-02", targetValue: "5.01" },
    ])
    expect(() => validatePeriods(p, "2026-11-15", "2026-12-02", "10.01")).not.toThrow()
    expect(() =>
      validatePeriods(
        [{ ...p[0]!, targetValue: "5.01" }, p[1]!],
        "2026-11-15",
        "2026-12-02",
        "10.01",
      ),
    ).toThrow("严格等于")
  })
  test("区间重叠、空档、无效日期和非法精度拒绝", () => {
    for (const date of ["2026-11-30", "2026-12-02", "2026-02-30"]) {
      expect(() =>
        validatePeriods(
          [
            { startDate: "2026-11-01", endDate: "2026-11-30", targetValue: "1" },
            { startDate: date, endDate: "2026-12-31", targetValue: "1" },
          ],
          "2026-11-01",
          "2026-12-31",
          "2",
        ),
      ).toThrow()
    }
    expect(() => monthlyPeriods("2026-11-01", "2026-12-31", "10.001")).toThrow()
  })
  test("周三四次、相邻时段与一年及100项上限", () => {
    const p = occurrences("2026-11-04T09:00:00+08:00", "2026-11-04T10:00:00+08:00", {
      frequency: "WEEKLY",
      until: "2026-11-25",
      weekdays: [3],
    })
    expect(p).toHaveLength(4)
    expect(p.map((t) => businessDate(t.startAt))).toEqual([
      "2026-11-04",
      "2026-11-11",
      "2026-11-18",
      "2026-11-25",
    ])
    const a = p[0]!,
      b = { startAt: a.endAt, endAt: new Date(a.endAt.getTime() + 60000) }
    expect(overlaps(a, b)).toBe(false)
    expect(overlaps(a, { ...b, startAt: new Date(a.endAt.getTime() - 1) })).toBe(true)
    expect(() =>
      occurrences("2026-11-04T09:00:00+08:00", "2026-11-04T10:00:00+08:00", {
        frequency: "DAILY",
        until: "2027-11-04",
      }),
    ).toThrow("100")
    expect(() => occurrences("2026-11-04T09:00:00", "2026-11-04T10:00:00")).toThrow("时区")
  })
  test("取消、部分批准、驳回和结束来源聚合", () => {
    expect(taskState(true)).toEqual({ state: "CANCELED", executable: false })
    expect(taskState(false)).toEqual({ state: "SCHEDULED", executable: true })
    const e = { started: true, ended: true, required: 2, approved: 1, pending: 1, rejected: 0 }
    expect(taskState(false, e).state).toBe("IN_REVIEW")
    expect(taskState(false, { ...e, pending: 0, rejected: 1 }).state).toBe("TO_ORGANIZE")
    expect(taskState(false, { ...e, approved: 2, pending: 0 }).state).toBe("COMPLETED")
    expect(taskState(false, { ...e, ended: false }).state).toBe("IN_PROGRESS")
    expect(taskState(false, { ...e, required: 0, approved: 0, pending: 0 }).state).toBe(
      "TO_ORGANIZE",
    )
  })
})
