import { AppError } from "@/utils/errors"
import { decimalUnits, decimalText } from "@/utils/decimal"
/** 取得 UTC+8 的业务自然日期，与数据库 UTC 时间存储分开处理。 */
export function businessToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}
/** 自然月减法使用原日期的日号，目标月份不足时取月末。 */
export function subtractMonths(value: string, months: number): string {
  const [y, m, d] = value.split("-").map(Number)
  const base = new Date(Date.UTC(y!, m! - 1 - months, 1))
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  base.setUTCDate(Math.min(d!, last))
  return base.toISOString().slice(0, 10)
}
/** 月份必须与合同相交，允许过期补填，不允许提前填报未来月份。 */
export function assertReportMonth(
  month: string,
  start: string,
  end: string,
  today = businessToday(),
) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    month < start.slice(0, 7) ||
    month > end.slice(0, 7) ||
    month > today.slice(0, 7)
  )
    throw AppError.badRequest("填报月份须在合同周期内且不得晚于本月")
}
/** 精确累计正式提交新增量；草稿和撤销记录不参与，历史按现有有效记录回算。 */
export function sumValues(values: string[]): string {
  return decimalText(values.reduce((sum, value) => sum + decimalUnits(value), 0n))
}
/** 按达标优先、逾期、三月、六月顺序计算预警，完成率允许超过 100%。 */
export function indicatorWarning(
  target: string,
  actual: string,
  start: string,
  end: string,
  asOfDate = businessToday(),
) {
  const goal = decimalUnits(target, true),
    done = decimalUnits(actual, false, 30)
  const warningLevel: "green" | "yellow" | "orange" | "red" =
    done >= goal
      ? "green"
      : asOfDate > end
        ? "red"
        : asOfDate >= subtractMonths(end, 3)
          ? "red"
          : asOfDate >= subtractMonths(end, 6)
            ? "orange"
            : "yellow"
  return {
    warningLevel,
    overdue: done < goal && asOfDate > end,
    notStarted: asOfDate < start,
    completionRate: Number((done * 10000n + goal / 2n) / goal) / 100,
  }
}
