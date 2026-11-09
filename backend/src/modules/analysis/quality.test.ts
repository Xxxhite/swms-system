import { describe, test, expect } from "bun:test"
import ExcelJS from "exceljs"
import { qualitySummary, type QualityRow } from "./quality.calculation"
import { exportQuality } from "./quality.export"
const row = (id: number, satisfied: number, neutral: number, status = "ACTIVE"): QualityRow => ({
  id,
  title: "=1+1",
  projectName: "测试项目",
  teamName: "测试团队",
  date: "2026-11-09",
  status,
  samples: satisfied + neutral,
  satisfied,
  neutral,
  dissatisfied: 0,
  suggestions: "+建议",
  href: `/activity/${id}`,
  version: 1,
})
describe("质量报告统计与导出", () => {
  test("覆盖率与满意占比分母分开、样本量加权，作废不计有效样本", () => {
    const rows = [row(1, 8, 2), row(2, 15, 15), row(3, 0, 0, "UNRATED")]
    expect(qualitySummary(rows, "service")).toMatchObject({
      total: 3,
      evaluated: 2,
      coverage: "66.67",
      samples: 40,
      satisfaction: "57.50",
    })
    expect(qualitySummary([], "service")).toMatchObject({ coverage: null, satisfaction: null })
    expect(qualitySummary([row(3, 0, 0, "UNRATED")], "service")).toMatchObject({
      evaluated: 0,
      samples: 0,
      satisfaction: null,
    })
    expect(qualitySummary([row(1, 1, 0, "SATISFIED")], "cooperation").satisfaction).toBeNull()
  })
  test("Excel和报告共用汇总，用户文本作为字符串", async () => {
    const rows = [row(1, 8, 2)],
      summary = qualitySummary(rows, "service")
    const bytes = await exportQuality({
      kind: "service",
      title: "服务质量反馈",
      rows,
      summary,
      meta: { filters: {}, fingerprint: "test", generatedAt: "2026-11-09", basis: "按实际结束日" },
    })
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes.buffer as ArrayBuffer)
    expect(book.getWorksheet("质量明细")!.getCell("A2").value).toBe("=1+1")
    expect(book.getWorksheet("质量明细")!.getCell("J2").value).toBe("+建议")
    expect(book.getWorksheet("汇总")!.getCell("D2").value).toBe(10)
  })
})
