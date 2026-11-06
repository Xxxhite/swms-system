import ExcelJS from "exceljs"
import type { calculateReport } from "./management.calculation"
export async function exportManagement(report: ReturnType<typeof calculateReport>) {
  const book = new ExcelJS.Workbook(),
    meta = book.addWorksheet("口径说明")
  meta.addRow([report.title])
  meta.addRow([report.meta.basis])
  const labels: Record<string, string> = {
    projectId: "项目",
    teamId: "团队",
    indicatorId: "指标",
    ownerId: "负责人",
    regionCode: "地区代码",
    serviceFieldCode: "服务领域",
    keyword: "关键词",
    status: "状态",
    form: "服务形式",
    unitType: "单位类型",
    relationship: "合作关系",
    dateFrom: "日期起",
    dateTo: "日期止",
    asOfDate: "业务截至日",
  }
  const states: Record<string, string> = {
    SUBMITTED: "有效档案",
    IN_REVIEW: "首次待审",
    CHANGE_IN_REVIEW: "更正待审",
    PENDING: "待处理",
    APPROVED: "已通过",
    REJECTED: "已退回",
    CANCELLED: "已撤回",
    TO_REGISTER: "待登记",
    TO_SUBMIT: "待提交",
    TO_CORRECT: "待更正",
    COMPLETED: "已完成",
    CANCELED: "已取消",
    SCHEDULED: "待开展",
    TO_ORGANIZE: "待整理",
    OVERDUE: "已逾期",
    UNSCHEDULED: "普通记录",
    NO_FOLLOWUP: "未登记跟进",
    CURRENT: "正在合作",
    POTENTIAL: "潜在合作",
    HISTORICAL: "历史合作",
    COLLECTIVE: "集体服务",
    HOME_VISIT: "入户走访",
    STATIONED: "驻点服务",
  }
  for (const [key, value] of Object.entries(report.meta.filters))
    meta.addRow([
      labels[key] ?? "筛选条件",
      key === "status" && value === "PENDING"
        ? report.kind === "approvals"
          ? "待审批"
          : "待跟进"
        : key === "status" && value === "IN_REVIEW"
          ? "待审批"
          : (states[String(value)] ?? String(value)),
    ])
  meta.addRow(["生成时间", report.meta.generatedAt])
  meta.addRow(["时效参考时间", report.meta.referenceTime])
  const sheet = book.addWorksheet("报告明细")
  sheet.addRow(report.columns.map((c) => c.label))
  for (const row of report.rows) sheet.addRow(report.columns.map((c) => row[c.key] ?? "—"))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: "frozen", ySplit: 1 }]
  sheet.columns.forEach((c) => (c.width = 22))
  const groups = book.addWorksheet("图表依据")
  groups.addRow(["状态", "条数"])
  for (const g of report.groups) groups.addRow([g.name, g.value])
  for (const a of report.averages) groups.addRow([a.name, a.samples, a.hours ?? "—"])
  if (Object.keys(report.details).length) {
    const sources = book.addWorksheet("来源档案")
    sources.addRow(["报告行", "来源", "日期", "申报／档案值", "状态", "说明"])
    for (const [key, rows] of Object.entries(report.details)) {
      const summary = report.rows.find((r) => r.key === key)
      const label = summary
        ? `${summary.projectName}／${summary.teamName}／${summary.indicatorName}`
        : "指标明细"
      for (const row of rows)
        sources.addRow([
          label,
          row.source,
          row.date,
          row.value,
          states[row.status] ?? row.status,
          row.note,
        ])
    }
  }
  return new Uint8Array(await book.xlsx.writeBuffer())
}
