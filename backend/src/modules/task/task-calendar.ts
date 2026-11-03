import { createHash } from "node:crypto"
import { AppError } from "@/utils/errors"
import { decimalText, decimalUnits } from "@/utils/decimal"

export function businessDate(date = new Date()): string {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}
export function dateValid(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
export function nextDay(value: string, days = 1): string {
  return new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10)
}
export function instant(value: string): Date {
  if (
    !dateValid(value.slice(0, 10)) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    throw AppError.badRequest("任务时间须为包含时区的有效时间")
  return new Date(value)
}
export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
export interface PeriodInput {
  startDate: string
  endDate: string
  targetValue: string
}
export function monthlyPeriods(start: string, end: string, total: string): PeriodInput[] {
  if (!dateValid(start) || !dateValid(end) || start > end) throw AppError.badRequest("合同期间无效")
  const ranges: PeriodInput[] = []
  let day = start
  while (day <= end) {
    const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0))
      .toISOString()
      .slice(0, 10)
    const stop = last < end ? last : end
    ranges.push({ startDate: day, endDate: stop, targetValue: "0.00" })
    day = nextDay(stop)
    if (ranges.length > 1200) throw AppError.badRequest("计划期间过长")
  }
  const units = decimalUnits(total),
    each = units / BigInt(ranges.length)
  return ranges.map((r, i) => ({
    ...r,
    targetValue: decimalText(i === ranges.length - 1 ? units - each * BigInt(i) : each),
  }))
}
export function validatePeriods(periods: PeriodInput[], start: string, end: string, total: string) {
  if (
    !periods.length ||
    periods.length > 1200 ||
    periods[0]!.startDate !== start ||
    periods.at(-1)!.endDate !== end
  )
    throw AppError.badRequest("阶段区间须完整覆盖合同期间")
  let expected = start,
    sum = 0n
  for (const p of periods) {
    if (
      !dateValid(p.startDate) ||
      !dateValid(p.endDate) ||
      p.startDate !== expected ||
      p.endDate < p.startDate
    )
      throw AppError.badRequest("阶段区间存在重叠、空档或无效日期")
    sum += decimalUnits(p.targetValue)
    expected = nextDay(p.endDate)
  }
  if (sum !== decimalUnits(total)) throw AppError.badRequest("阶段计划量合计须严格等于团队目标")
}
export interface Recurrence {
  frequency: "DAILY" | "WEEKLY"
  until: string
  weekdays?: number[]
}
export function occurrences(startAt: string, endAt: string, recurrence?: Recurrence) {
  const start = instant(startAt),
    end = instant(endAt)
  if (start >= end) throw AppError.badRequest("结束时间须晚于开始时间")
  if (!recurrence) return [{ startAt: start, endAt: end }]
  const first = businessDate(start)
  if (
    !dateValid(recurrence.until) ||
    recurrence.until < first ||
    recurrence.until > nextDay(first, 366)
  )
    throw AppError.badRequest("周期截止日期须在开始日期起一年内")
  if (
    recurrence.frequency === "WEEKLY" &&
    (!recurrence.weekdays?.length ||
      recurrence.weekdays.some((d) => d < 0 || d > 6 || !Number.isInteger(d)))
  )
    throw AppError.badRequest("请选择有效的重复星期")
  const result: Array<{ startAt: Date; endAt: Date }> = []
  for (let day = first, offset = 0; day <= recurrence.until; day = nextDay(day), offset++) {
    if (
      recurrence.frequency === "WEEKLY" &&
      !recurrence.weekdays!.includes(new Date(day).getUTCDay())
    )
      continue
    result.push({
      startAt: new Date(start.getTime() + offset * 86400000),
      endAt: new Date(end.getTime() + offset * 86400000),
    })
    if (result.length > 100) throw AppError.badRequest("每批最多生成100项任务")
  }
  if (!result.length) throw AppError.badRequest("指定期间没有符合条件的日期")
  return result
}
export function overlaps(a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) {
  return a.startAt < b.endAt && b.startAt < a.endAt
}

/** B2仅由安排来源决定状态；后续执行、审批接入时显式调用聚合边界。 */
export function taskState(
  canceled: boolean,
  execution?: {
    started: boolean
    ended: boolean
    required: number
    approved: number
    pending: number
    rejected: number
  },
) {
  if (canceled) return { state: "CANCELED", executable: false }
  if (!execution?.started) return { state: "SCHEDULED", executable: true }
  if (!execution.ended) return { state: "IN_PROGRESS", executable: true }
  if (execution.rejected > 0) return { state: "TO_ORGANIZE", executable: false }
  if (
    execution.required > 0 &&
    execution.approved === execution.required &&
    execution.pending === 0
  )
    return { state: "COMPLETED", executable: false }
  if (execution.pending > 0 || execution.approved > 0)
    return { state: "IN_REVIEW", executable: false }
  return { state: "TO_ORGANIZE", executable: false }
}
