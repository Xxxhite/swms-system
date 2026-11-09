import { describe, test, expect } from "bun:test"
import { validateFeedback } from "./feedback.service"
import type { FeedbackInput } from "./feedback.validation"
const now = new Date("2026-11-09T10:00:00Z"),
  ended = new Date("2026-11-08T10:00:00Z")
const form: FeedbackInput = {
  version: 0,
  requestKey: "feedback-test",
  satisfiedCount: 8,
  neutralCount: 2,
  dissatisfiedCount: 0,
  source: "PAPER",
  sourceNote: "",
  feedbackDate: "2026-11-09",
  suggestions: "",
}
describe("服务反馈业务校验", () => {
  test("固定样本、实际日期、其他来源及不满意说明", () => {
    expect(() => validateFeedback(form, ended, now)).not.toThrow()
    for (const change of [
      { satisfiedCount: 0, neutralCount: 0 },
      { satisfiedCount: -1 },
      { satisfiedCount: 0.5 },
      { satisfiedCount: 100000 },
      { feedbackDate: "2026-02-30" },
      { feedbackDate: "2026-11-07" },
      { feedbackDate: "2026-11-10" },
      { source: "OTHER" as const },
      { dissatisfiedCount: 1 },
    ])
      expect(() => validateFeedback({ ...form, ...change }, ended, now)).toThrow()
  })
})
