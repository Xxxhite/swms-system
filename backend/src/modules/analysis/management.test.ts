import ExcelJS from "exceljs"
import { exportManagement } from "./management.export"
import { describe, expect, test } from "bun:test"
import { normalizeReportQuery } from "./management.calculation"
describe("B5报告筛选口径", () => {
  const now = new Date("2026-11-06T01:00:00Z")
  test("业务日、页码与指纹分离，禁止未来和错误日期", () => {
    expect(
      normalizeReportQuery("progress", { page: 2, pageSize: 20, fingerprint: "0".repeat(64) }, now),
    ).toEqual({ asOfDate: "2026-11-06" })
    for (const q of [{ asOfDate: "2026-11-07" }, { asOfDate: "2026-02-30" }, { pageSize: 13 }])
      expect(() => normalizeReportQuery("progress", q, now)).toThrow()
  })
  test("报告不静默忽略别的页签条件，日期范围须有效", () => {
    expect(() => normalizeReportQuery("resources", { projectId: 1 }, now)).toThrow()
    expect(() => normalizeReportQuery("tasks", { asOfDate: "2026-11-06" }, now)).toThrow()
    expect(() =>
      normalizeReportQuery("approvals", { dateFrom: "2026-11-06", dateTo: "2026-11-01" }, now),
    ).toThrow()
    expect(normalizeReportQuery("resources", { ownerId: 1, keyword: "" }, now)).toEqual({
      ownerId: 1,
    })
  })
})

test("管理Excel使用业务标签并保留用户文本为字符串", async () => {
  const book = new ExcelJS.Workbook()
  const bytes = await exportManagement({
    kind: "progress",
    title: "项目进度",
    options: { owners: [], indicators: [] },
    columns: [{ key: "projectName", label: "项目" }],
    rows: [
      {
        key: "TEAM-1-2",
        href: "",
        status: "阶段尚差",
        projectName: "=1+1",
        teamName: "团队甲",
        indicatorName: "活动次数",
      },
    ],
    details: {
      "TEAM-1-2": [
        {
          key: "record-1",
          href: "",
          status: "SUBMITTED",
          source: "档案1",
          date: "2026-11-06",
          value: "2.00",
          note: "有效档案",
        },
      ],
    },
    groups: [{ name: "阶段尚差", value: 1 }],
    averages: [],
    meta: {
      filters: { asOfDate: "2026-11-06" },
      referenceTime: "2026-11-06T01:00:00Z",
      generatedAt: "2026-11-06T01:00:00Z",
      fingerprint: "0".repeat(64),
      basis: "口径",
      version: "b5-v1",
      total: 1,
    },
  })
  await book.xlsx.load(bytes.buffer as ArrayBuffer)
  expect(book.getWorksheet("报告明细")!.getCell("A2").type).toBe(ExcelJS.ValueType.String)
  expect(book.getWorksheet("报告明细")!.getCell("A2").value).toBe("=1+1")
  expect(book.getWorksheet("口径说明")!.getCell("A3").value).toBe("业务截至日")
  expect(book.getWorksheet("来源档案")!.getCell("A2").value).toBe("=1+1／团队甲／活动次数")
  expect(book.getWorksheet("来源档案")!.getCell("E2").value).toBe("有效档案")
})
