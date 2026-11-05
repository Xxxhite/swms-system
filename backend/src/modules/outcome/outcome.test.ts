import { describe, test, expect } from "bun:test"
import type { OutcomeSource } from "@/db/schema/outcome"
import {
  calculateOutcome,
  aggregateMeasures,
  intervalSeconds,
  hoursValue,
} from "./outcome.calculation"
const source = (): OutcomeSource => ({
  taskId: 1,
  taskVersion: 1,
  sourceVersion: 4,
  projectId: 1,
  teamId: 1,
  title: "测试服务",
  date: "2026-11-04",
  form: "COLLECTIVE",
  state: "ENDED",
  leaderId: 1,
  startedAt: "2026-11-04T09:00:00+08:00",
  endedAt: "2026-11-04T11:00:00+08:00",
  summary: "总结",
  staff: [
    {
      id: 1,
      name: "虚构工作人员",
      inId: 1,
      outId: 2,
      startAt: "2026-11-04T09:00:00+08:00",
      endAt: "2026-11-04T10:00:00+08:00",
      flags: [],
      location: "位置正常",
    },
  ],
  participants: Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    name: `虚构对象${i}`,
    rosterId: i + 1,
    eventId: i + 1,
    occurredAt: "2026-11-04T09:05:00+08:00",
    method: "SELF",
    status: "RECORDED",
    flags: [],
  })),
  evidence: [],
  issues: [],
  rules: [],
})
describe("来源成果计算", () => {
  test("8人服务计1场8人次，跨任务人次可累加、合同人数集合去重", () => {
    const a = source(),
      b = source()
    b.participants = b.participants.slice(0, 3)
    expect(calculateOutcome(a, "SCENES").value).toBe("1.00")
    expect(
      aggregateMeasures([calculateOutcome(a, "VISITS"), calculateOutcome(b, "VISITS")], "VISITS"),
    ).toBe("11.00")
    expect(
      aggregateMeasures([calculateOutcome(a, "PEOPLE"), calculateOutcome(b, "PEOPLE")], "PEOPLE"),
    ).toBe("8.00")
  })
  test("同一人员跨任务重叠按并集，不同人员各自累计", () => {
    const a = source(),
      b = source()
    b.staff[0]!.startAt = "2026-11-04T09:30:00+08:00"
    b.staff[0]!.endAt = "2026-11-04T10:30:00+08:00"
    const measures = [calculateOutcome(a, "STAFF_HOURS"), calculateOutcome(b, "STAFF_HOURS")]
    expect(aggregateMeasures(measures, "STAFF_HOURS")).toBe("1.50")
    b.staff[0]!.id = 2
    expect(
      aggregateMeasures([measures[0]!, calculateOutcome(b, "STAFF_HOURS")], "STAFF_HOURS"),
    ).toBe("2.00")
  })
  test("跨月时段按查询边界裁剪，秒数汇总后精确折算", () => {
    const intervals = [
      { userId: 1, startAt: "2026-10-31T23:30:00+08:00", endAt: "2026-11-01T00:30:00+08:00" },
    ]
    expect(hoursValue(intervalSeconds(intervals, Date.parse("2026-11-01T00:00:00+08:00")))).toBe(
      "0.50",
    )
    expect(hoursValue(5100 * 2)).toBe("2.83")
  })
  test("核验未完成不批准，排除某对象后重新计算且保留原始参与", () => {
    const s = source()
    s.issues = [
      { key: "e1", label: "辅助登记", target: "PARTICIPATION", targetId: 1, reason: "", notes: [] },
    ]
    expect(() => calculateOutcome(s, "VISITS", [], "0", true)).toThrow("未核验")
    expect(
      calculateOutcome(
        s,
        "VISITS",
        [{ key: "e1", decision: "EXCLUDE", reason: "不计本次成果" }],
        "0",
        true,
      ).value,
    ).toBe("7.00")
    expect(s.participants.length).toBe(8)
    expect(() =>
      calculateOutcome(s, "VISITS", [{ key: "foreign", decision: "ACCEPT", reason: "x" }]),
    ).toThrow("不属于")
  })
  test("作废参与不累计、中止及无实际对象的集体服务不计场", () => {
    const s = source()
    s.participants[0]!.status = "VOID"
    expect(calculateOutcome(s, "VISITS").value).toBe("7.00")
    s.state = "STOPPED"
    expect(calculateOutcome(s, "SCENES").value).toBe("0.00")
    s.state = "ENDED"
    s.participants = []
    expect(calculateOutcome(s, "SCENES").value).toBe("0.00")
    s.form = "STATIONED"
    expect(calculateOutcome(s, "SCENES").value).toBe("1.00")
  })
  test("人工成果保留精确小数与非负校验", () => {
    expect(
      aggregateMeasures(
        [
          calculateOutcome(source(), "MANUAL", [], "0.10"),
          calculateOutcome(source(), "MANUAL", [], "0.20"),
        ],
        "MANUAL",
      ),
    ).toBe("0.30")
    expect(() => calculateOutcome(source(), "MANUAL", [], "-1")).toThrow()
  })
})

test("执行登记分指标计算与旧来源共用人数／工时集合", () => {
  const legacy = source(),
    simple = source()
  simple.staff = []
  simple.participants = []
  simple.registration = {
    schemaVersion: 1,
    requestKey: "r",
    fingerprint: "h",
    submittedBy: 1,
    submittedAt: "2026-11-04T12:00:00+08:00",
    indicators: [
      { indicatorId: 1, value: "1", participantIds: [], intervals: [] },
      { indicatorId: 2, value: "20", participantIds: [], intervals: [] },
      { indicatorId: 3, value: "3", participantIds: [], intervals: [] },
      { indicatorId: 4, value: "0", participantIds: [1, 2], intervals: [] },
      {
        indicatorId: 5,
        value: "0",
        participantIds: [],
        intervals: [
          { userId: 1, startAt: "2026-11-04T09:30:00+08:00", endAt: "2026-11-04T11:00:00+08:00" },
        ],
      },
      { indicatorId: 6, value: "0.10", participantIds: [], intervals: [] },
    ],
  }
  const calc = (mode: Parameters<typeof calculateOutcome>[1], id: number) =>
    calculateOutcome(simple, mode, [], "0", true, id)
  expect(calc("SCENES", 1).value).toBe("1.00")
  expect(calc("VISITS", 2).value).toBe("20.00")
  expect(calc("VISITS", 3).value).toBe("3.00")
  expect(calc("MANUAL", 6).value).toBe("0.10")
  expect(aggregateMeasures([calculateOutcome(legacy, "PEOPLE"), calc("PEOPLE", 4)], "PEOPLE")).toBe(
    "8.00",
  )
  expect(
    aggregateMeasures(
      [calculateOutcome(legacy, "STAFF_HOURS"), calc("STAFF_HOURS", 5)],
      "STAFF_HOURS",
    ),
  ).toBe("2.00")
  expect(() => calc("VISITS", 999)).toThrow("登记依据")
  simple.state = "STOPPED"
  expect(calc("SCENES", 1).value).toBe("0.00")
})
