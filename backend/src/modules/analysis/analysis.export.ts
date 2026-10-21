import ExcelJS from "exceljs"
import type { ServiceService } from "@/modules/service/service.service"
type Rows = Awaited<ReturnType<ServiceService["progress"]>>
/** 输出真实 xlsx；文本明确写字符串，用户输入不会作为 Excel 公式执行。 */
export async function exportIndicators(rows: Rows): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook()
  book.creator = "温馨社工"
  book.created = new Date()
  const warnings = { green: "已达标", yellow: "黄色预警", orange: "橙色预警", red: "红色预警" }
  for (const [scope, name] of [
    ["PROJECT", "合同指标"],
    ["TEAM", "团队指标"],
    ["SELF", "本人记录"],
  ]) {
    const sheet = book.addWorksheet(name!)
    sheet.addRow([
      "项目",
      "指标",
      "单位",
      "统计口径",
      "统计范围",
      "目标",
      "当月新增",
      "累计完成",
      "完成率(%)",
      "到期日",
      "预警",
      "已逾期",
      "业务日期",
      "累计口径",
    ])
    for (const r of rows.filter((r) => r.statisticsScope === scope))
      sheet.addRow([
        r.projectName,
        r.indicatorName,
        r.unit,
        r.definition,
        r.teamName,
        r.targetValue,
        r.monthlyValue,
        r.cumulative,
        r.completionRate,
        r.endDate,
        r.warningLevel ? warnings[r.warningLevel] : "本人局部数据",
        r.overdue ? "是" : "否",
        r.asOfDate,
        r.calculationNote,
      ])
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: "frozen", ySplit: 1 }]
    sheet.columns.forEach((c) => (c.width = 20))
    sheet.getColumn(4).width = 40
    sheet.autoFilter = { from: "A1", to: "N1" }
  }
  const note = book.addWorksheet("口径说明")
  note.addRow(["合同、团队与本人记录分别展示，不将分层记录重复相加。"])
  note.addRow(["按现有有效记录回算，草稿及撤销记录不计累计；不同单位及口径不得混合。"])
  note.addRow(["数量为精确十进制文本，完成率为百分数；本人局部记录不计算团队完成率。"])
  return new Uint8Array(await book.xlsx.writeBuffer())
}
