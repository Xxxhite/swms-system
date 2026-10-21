import { describe, expect, test } from "bun:test"
import { decimalUnits, decimalText } from "@/utils/decimal"
import {
  subtractMonths,
  indicatorWarning,
  assertReportMonth,
  sumValues,
} from "./indicator-calculation"
import { exportIndicators } from "@/modules/analysis/analysis.export"
import ExcelJS from "exceljs"
describe("指标计算和 Excel", () => {
  test("小数精确计算及取值范围", () => {
    expect(decimalText(decimalUnits("0.10") + decimalUnits("0.20"))).toBe("0.30")
    expect(sumValues(["10.11", "0.09"])).toBe("10.20")
    for (const value of ["-1", "1.001", "1e2", "01", "10000000000"]) {
      expect(() => decimalUnits(value)).toThrow()
    }
    expect(() => decimalUnits("0", true)).toThrow()
  })
  test("自然月边界、月末截断和闰年", () => {
    expect(subtractMonths("2027-08-31", 6)).toBe("2027-02-28")
    expect(subtractMonths("2024-08-31", 6)).toBe("2024-02-29")
    for (const [date, color] of [
      ["2027-02-27", "yellow"],
      ["2027-02-28", "orange"],
      ["2027-05-30", "orange"],
      ["2027-05-31", "red"],
      ["2027-08-31", "red"],
    ] as const)
      expect(indicatorWarning("100", "99", "2026-01-01", "2027-08-31", date).warningLevel).toBe(
        color,
      )
    expect(indicatorWarning("100", "99", "2026-01-01", "2027-08-31", "2027-08-31").overdue).toBe(
      false,
    )
    expect(indicatorWarning("100", "99", "2026-01-01", "2027-08-31", "2027-09-01").overdue).toBe(
      true,
    )
    expect(indicatorWarning("100", "110", "2026-01-01", "2027-08-31", "2027-09-01")).toMatchObject({
      warningLevel: "green",
      overdue: false,
      completionRate: 110,
    })
  })
  test("月中起止、补填、未来月份及格式", () => {
    expect(() =>
      assertReportMonth("2026-10", "2026-10-20", "2026-10-25", "2026-11-01"),
    ).not.toThrow()
    for (const month of ["2026-09", "2026-11", "2026-13", "2026-1"])
      expect(() => assertReportMonth(month, "2026-10-20", "2026-12-25", "2026-10-21")).toThrow()
  })
  test("Excel 在 Bun 中写出回读，层级分表且文本不会变成公式", async () => {
    const rows = [
      {
        projectId: 1,
        projectName: "=1+1",
        indicatorId: 1,
        indicatorName: "中文指标",
        unit: "人次",
        definition: "原样文本",
        teamId: 1,
        teamName: "团队甲",
        statisticsScope: "TEAM",
        targetValue: "0.30",
        monthlyValue: "0.10",
        cumulative: "0.20",
        completionRate: 66.67,
        warningLevel: "orange",
        overdue: false,
        notStarted: false,
        endDate: "2027-08-31",
        asOfDate: "2027-02-28",
        month: "2027-02",
        calculationNote: "按现有有效记录回算",
        serviceArea: "演示",
        serviceFieldCode: "社区建设",
      },
    ] as const
    const bytes = await exportIndicators([...rows])
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes.buffer as ArrayBuffer)
    expect(book.worksheets).toHaveLength(4)
    expect(book.getWorksheet("团队指标")!.getCell("A2").value).toBe("=1+1")
    expect(book.getWorksheet("团队指标")!.getCell("F2").value).toBe("0.30")
    expect(book.getWorksheet("合同指标")!.rowCount).toBe(1)
  })
})
