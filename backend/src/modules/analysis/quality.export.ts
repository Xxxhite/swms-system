import ExcelJS from "exceljs"
import { ratingLabels, type calculateQuality } from "./quality.calculation"
export async function exportQuality(report: ReturnType<typeof calculateQuality>) {
  const book = new ExcelJS.Workbook(),
    meta = book.addWorksheet("口径说明")
  meta.addRow([report.title])
  meta.addRow([report.meta.basis])
  meta.addRow(["生成时间", report.meta.generatedAt])
  const labels: Record<string, string> = {
    projectId: "项目",
    teamId: "团队",
    resourceId: "资源",
    dateFrom: "服务日期起",
    dateTo: "服务日期止",
    keyword: "关键词",
    relationship: "合作关系",
    rating: "评价等级",
  }
  for (const [k, v] of Object.entries(report.meta.filters))
    meta.addRow([labels[k] ?? k, ratingLabels[v as keyof typeof ratingLabels] ?? String(v)])
  const totals = book.addWorksheet("汇总")
  totals.addRow([
    "适用事项",
    "已反馈／评价",
    "覆盖率%",
    "样本份数",
    "满意",
    "一般",
    "不满意／待改进",
    "满意占比%",
  ])
  const s = report.summary
  totals.addRow([
    s.total,
    s.evaluated,
    s.coverage ?? "—",
    s.samples,
    s.satisfied,
    s.neutral,
    s.dissatisfied,
    s.satisfaction ?? "—",
  ])
  const sheet = book.addWorksheet("质量明细")
  sheet.addRow([
    "任务／合作事项",
    "项目",
    "团队／资源",
    "服务／评价日期",
    "反馈状态／评价",
    "有效份数",
    "满意",
    "一般",
    "不满意／待改进",
    "建议",
  ])
  for (const r of report.rows)
    sheet.addRow([
      r.title,
      r.projectName,
      r.teamName,
      r.date,
      r.status === "ACTIVE" ? "有效反馈" : ratingLabels[r.status as keyof typeof ratingLabels],
      r.samples,
      r.satisfied,
      r.neutral,
      r.dissatisfied,
      r.suggestions,
    ])
  sheet.views = [{ state: "frozen", ySplit: 1 }]
  sheet.columns.forEach((c) => (c.width = 22))
  return new Uint8Array(await book.xlsx.writeBuffer())
}
