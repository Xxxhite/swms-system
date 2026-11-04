import { expect, test } from "bun:test"
import type { BusinessState } from "@/modules/project/project.repository"
import type { OutcomeMeasure } from "@/db/schema/outcome"
import { sourceActual } from "./outcome.statistics"
function state(measures: OutcomeMeasure[]) {
  // 仅构造聚合使用的数据字段，其他业务行为由数据库集成覆盖。
  return {
    indicators: [{ id: 1, projectId: 1 }],
    contracts: [{ projectId: 1, startDate: "2026-10-01", endDate: "2026-11-30" }],
    reports: measures.map((_, i) => ({
      id: i + 1,
      indicatorId: 1,
      teamId: i + 1,
      status: "SUBMITTED",
      serviceDate: i ? "2026-11-01" : "2026-10-31",
      month: i ? "2026-11" : "2026-10",
      actualValue: "0.00",
    })),
    outcomes: {
      links: measures.map((_, i) => ({ recordId: i + 1, effectiveReviewId: i + 1 })),
      reviews: measures.map((measure, i) => ({ id: i + 1, measure })),
    },
  } as unknown as BusinessState
}
test("人数月度单独去重，合同及授权团队各自聚合，待审不生效", () => {
  const data = state([
    { mode: "PEOPLE", value: "2.00", people: [1, 2], intervals: [] },
    { mode: "PEOPLE", value: "1.00", people: [1], intervals: [] },
  ])
  expect(sourceActual(data, data.reports, 1, undefined, "2026-11-04", false).value).toBe("2.00")
  expect(sourceActual(data, data.reports, 1, undefined, "2026-11-04", true).value).toBe("1.00")
  expect(sourceActual(data, data.reports, 1, 2, "2026-11-04", false).value).toBe("1.00")
  data.reports[1]!.status = "IN_REVIEW"
  expect(sourceActual(data, data.reports, 1, undefined, "2026-11-04", true).value).toBe("0.00")
})
test("工时跨月与合同边界裁剪，月底查询不受档案开场月份限制", () => {
  const data = state([
    {
      mode: "STAFF_HOURS",
      value: "2.00",
      people: [],
      intervals: [
        { userId: 1, startAt: "2026-10-31T23:30:00+08:00", endAt: "2026-11-01T01:30:00+08:00" },
      ],
    },
  ])
  expect(sourceActual(data, data.reports, 1, undefined, "2026-10-31", true).value).toBe("0.50")
  expect(sourceActual(data, data.reports, 1, undefined, "2026-11-30", true).value).toBe("1.50")
  data.contracts[0]!.startDate = "2026-11-01"
  expect(sourceActual(data, data.reports, 1, undefined, "2026-12-31", false).value).toBe("1.50")
})
