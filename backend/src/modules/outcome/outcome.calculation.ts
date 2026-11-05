import type {
  CalculationMode,
  OutcomeDecision,
  OutcomeInterval,
  OutcomeMeasure,
  OutcomeSource,
} from "@/db/schema/outcome"
import { AppError } from "@/utils/errors"
import { decimalText, decimalUnits } from "@/utils/decimal"

/** 按人员合并真实时间段，裁剪查询区间；先合并毫秒再转换整秒，避免逐段取整误差。 */
export function intervalSeconds(intervals: OutcomeInterval[], from = -Infinity, to = Infinity) {
  const groups = new Map<number, Array<[number, number]>>()
  for (const interval of intervals) {
    const start = Math.max(Date.parse(interval.startAt), from),
      end = Math.min(Date.parse(interval.endAt), to)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const group = groups.get(interval.userId) ?? []
    group.push([start, end])
    groups.set(interval.userId, group)
  }
  let millis = 0
  for (const group of groups.values()) {
    group.sort((a, b) => a[0] - b[0])
    let start = group[0]![0],
      end = group[0]![1]
    for (const [nextStart, nextEnd] of group.slice(1)) {
      if (nextStart <= end) end = Math.max(end, nextEnd)
      else {
        millis += end - start
        start = nextStart
        end = nextEnd
      }
    }
    millis += end - start
  }
  return Math.floor(millis / 1000)
}
export function hoursValue(seconds: number) {
  return decimalText((BigInt(seconds) * 100n + 1800n) / 3600n)
}
export function calculateOutcome(
  source: OutcomeSource,
  mode: CalculationMode,
  decisions: OutcomeDecision[] = [],
  manualValue = "0.00",
  strict = false,
  indicatorId?: number,
): OutcomeMeasure {
  if (source.registration) {
    const entry = source.registration.indicators.find((r) => r.indicatorId === indicatorId)
    if (mode === "MANUAL" && !indicatorId && !source.rules.length)
      return { mode, value: "0.00", people: [], intervals: [] }
    if (!entry) throw AppError.conflict("缺少本指标的执行登记依据")
    if (decisions.length) throw AppError.badRequest("执行登记不使用旧现场逐项核验")
    const people = [...new Set(entry.participantIds)],
      intervals = entry.intervals
    const value =
      mode === "SCENES"
        ? source.state === "ENDED"
          ? "1.00"
          : "0.00"
        : mode === "PEOPLE"
          ? decimalText(BigInt(people.length) * 100n)
          : mode === "STAFF_HOURS"
            ? hoursValue(intervalSeconds(intervals))
            : decimalText(decimalUnits(entry.value))
    return {
      mode,
      value,
      people: mode === "PEOPLE" ? people : [],
      intervals: mode === "STAFF_HOURS" ? intervals : [],
    }
  }
  const byKey = new Map(decisions.map((d) => [d.key, d]))
  if (
    byKey.size !== decisions.length ||
    decisions.some((d) => !source.issues.some((i) => i.key === d.key))
  )
    throw AppError.badRequest("核验来源重复或不属于本次快照")
  if (decisions.some((d) => !d.reason.trim())) throw AppError.badRequest("请填写逐项核验依据")
  if (strict && source.issues.some((i) => !byKey.has(i.key)))
    throw AppError.conflict("仍有未核验来源，请逐项采纳或排除")
  const excluded = source.issues.filter((i) => byKey.get(i.key)?.decision === "EXCLUDE")
  const sessionExcluded = excluded.some((i) => i.target === "SESSION")
  const people = [
    ...new Set(
      source.participants
        .filter(
          (p) =>
            p.status === "RECORDED" &&
            !sessionExcluded &&
            !excluded.some((i) => i.target === "PARTICIPATION" && i.targetId === p.id),
        )
        .map((p) => p.id),
    ),
  ]
  const intervals: OutcomeInterval[] = source.staff.flatMap((s) => {
    if (
      sessionExcluded ||
      excluded.some((i) => i.target === "STAFF" && i.targetId === s.id) ||
      !s.startAt ||
      !s.endAt
    )
      return []
    const start = Math.max(Date.parse(s.startAt), Date.parse(source.startedAt)),
      end = Math.min(Date.parse(s.endAt), Date.parse(source.endedAt))
    return end > start
      ? [
          {
            userId: s.id,
            startAt: new Date(start).toISOString(),
            endAt: new Date(end).toISOString(),
          },
        ]
      : []
  })
  let value: string
  switch (mode) {
    case "MANUAL":
      value = decimalText(decimalUnits(manualValue))
      break
    case "VISITS":
    case "PEOPLE":
      value = decimalText(BigInt(people.length) * 100n)
      break
    case "STAFF_HOURS":
      value = hoursValue(intervalSeconds(intervals))
      break
    case "SCENES":
      value =
        source.state === "ENDED" &&
        !sessionExcluded &&
        intervals.some((i) => i.userId === source.leaderId) &&
        (source.form === "STATIONED" || people.length > 0)
          ? "1.00"
          : "0.00"
      break
  }
  return { mode, value, people, intervals }
}
export function aggregateMeasures(
  measures: OutcomeMeasure[],
  mode: CalculationMode,
  from = -Infinity,
  to = Infinity,
) {
  if (mode === "PEOPLE")
    return decimalText(BigInt(new Set(measures.flatMap((m) => m.people)).size) * 100n)
  if (mode === "STAFF_HOURS")
    return hoursValue(
      intervalSeconds(
        measures.flatMap((m) => m.intervals),
        from,
        to,
      ),
    )
  return decimalText(measures.reduce((total, m) => total + decimalUnits(m.value), 0n))
}
