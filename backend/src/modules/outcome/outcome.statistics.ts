import type { BusinessState } from "@/modules/project/project.repository"
import type { CalculationMode, OutcomeMeasure } from "@/db/schema/outcome"
import { aggregateMeasures } from "./outcome.calculation"
import { decimalText, decimalUnits } from "@/utils/decimal"

/** 正式量只读已批准的有效档案及其核定来源；人员和小时按授权后的集合重新聚合。 */
export function sourceActual(
  data: BusinessState,
  reports: BusinessState["reports"],
  indicatorId: number,
  teamId: number | undefined,
  asOfDate: string,
  monthOnly: boolean,
) {
  const start = monthOnly ? `${asOfDate.slice(0, 7)}-01` : "0000-00-00",
    end = asOfDate
  const measures: OutcomeMeasure[] = [],
    manual: string[] = []
  for (const record of reports.filter(
    (r) =>
      r.indicatorId === indicatorId && (!teamId || r.teamId === teamId) && r.status === "SUBMITTED",
  )) {
    const link = data.outcomes.links.find((l) => l.recordId === record.id),
      review = data.outcomes.reviews.find((r) => r.id === link?.effectiveReviewId)
    if (link && !review) continue
    if (review?.measure.mode === "STAFF_HOURS") {
      measures.push(review.measure)
      continue
    }
    if (
      record.serviceDate
        ? record.serviceDate < start || record.serviceDate > end
        : monthOnly
          ? record.month !== asOfDate.slice(0, 7)
          : record.month > asOfDate.slice(0, 7)
    )
      continue
    if (review) measures.push(review.measure)
    else manual.push(record.actualValue)
  }
  const mode: CalculationMode = measures.some((m) => m.mode === "PEOPLE")
    ? "PEOPLE"
    : measures.some((m) => m.mode === "STAFF_HOURS")
      ? "STAFF_HOURS"
      : "MANUAL"
  const indicator = data.indicators.find((i) => i.id === indicatorId),
    contract = data.contracts.find((c) => c.projectId === indicator?.projectId)
  const from = Math.max(
      monthOnly ? Date.parse(`${start}T00:00:00+08:00`) : -Infinity,
      contract ? Date.parse(`${contract.startDate}T00:00:00+08:00`) : -Infinity,
    ),
    to = Math.min(
      Date.parse(`${end}T00:00:00+08:00`) + 86400000,
      contract ? Date.parse(`${contract.endDate}T00:00:00+08:00`) + 86400000 : Infinity,
    )
  const total =
    decimalUnits(aggregateMeasures(measures, mode, from, to)) +
    manual.reduce((s, v) => s + decimalUnits(v), 0n)
  return {
    value: decimalText(total),
    note:
      mode === "PEOPLE"
        ? "按有效核定来源中的对象编号去重，月度与合同累计分别计算"
        : mode === "STAFF_HOURS"
          ? "按人员实际时段并集合并，汇总秒数后折算小时"
          : "按已批准的有效档案回算",
  }
}
