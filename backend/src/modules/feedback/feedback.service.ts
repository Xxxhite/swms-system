import type { Actor } from "@/utils/authorization"
import { assertVersion } from "@/utils/authorization"
import { businessDate, dateValid, fingerprint } from "@/modules/task/task-calendar"
import { AppError } from "@/utils/errors"
import { canReadFollowup, actualManager } from "@/modules/management/management.authorization"
import { feedbackRepository, type FeedbackRepository } from "./feedback.repository"
import { applicableFeedback, feedbackTask, feedbackOwner } from "./feedback.authorization"
import { replay, qualityHistory } from "./feedback.history"
import type { FeedbackInput, FeedbackVoidInput } from "./feedback.validation"
export function validateFeedback(input: FeedbackInput, endedAt: Date, now: Date) {
  const counts = [input.satisfiedCount, input.neutralCount, input.dissatisfiedCount]
  const total = counts.reduce((a, b) => a + b, 0)
  if (counts.some((c) => !Number.isInteger(c) || c < 0) || total <= 0 || total > 100000)
    throw AppError.badRequest("有效反馈份数须为1—100000的整数")
  if (
    !dateValid(input.feedbackDate) ||
    input.feedbackDate < businessDate(endedAt) ||
    input.feedbackDate > businessDate(now)
  )
    throw AppError.badRequest("反馈日期须在实际服务结束日至今天之间")
  if (input.source === "OTHER" && !input.sourceNote.trim())
    throw AppError.badRequest("请说明其他反馈来源")
  if (input.dissatisfiedCount && !input.suggestions.trim())
    throw AppError.badRequest("请说明不满意反馈的主要问题")
}
export class FeedbackService {
  constructor(
    readonly repository: FeedbackRepository = feedbackRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  detail(actor: Actor, id: number) {
    return this.repository.run(actor, false, (data) => {
      const current = data.actor!,
        task = feedbackTask(data, current, id),
        row = data.feedback.find((f) => f.taskId === id)
      let canEdit = applicableFeedback(data, task, this.now())
      try {
        feedbackOwner(data, current, task, this.now())
      } catch {
        canEdit = false
      }
      const followups = data.management.filter(
        (m) => m.sourceType === "TASK" && m.sourceId === id && canReadFollowup(data, current, m),
      )
      const related = data.feedback
        .filter((f) => f.taskId !== id && f.status === "ACTIVE")
        .flatMap((f) => {
          const t = data.scheduling.tasks.find(
            (t) => t.id === f.taskId && t.projectId === task.projectId && t.teamId === task.teamId,
          )
          if (!t || !applicableFeedback(data, t, this.now())) return []
          try {
            feedbackTask(data, current, t.id)
          } catch {
            return []
          }
          return [
            {
              taskId: t.id,
              title: t.title,
              date: f.feedbackDate,
              suggestions: f.suggestions,
              dissatisfiedCount: f.dissatisfiedCount,
              followups: data.management
                .filter(
                  (m) =>
                    m.sourceType === "TASK" &&
                    m.sourceId === t.id &&
                    canReadFollowup(data, current, m),
                )
                .map((m) => ({ id: m.id, title: m.title, status: m.status, result: m.result })),
            },
          ]
        })
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5)
      return {
        task: {
          id,
          title: task.title,
          projectId: task.projectId,
          teamId: task.teamId,
          form: task.form,
        },
        feedback: row ?? null,
        canEdit,
        applicable: !!applicableFeedback(data, task, this.now()),
        endedAt: data.executions.sessions.find((s) => s.taskId === id)?.endedAt ?? null,
        summary: data.outcomes.outcomes.find((o) => o.taskId === id)?.summary ?? "",
        history: row ? qualityHistory(data, "task_feedback", row.id) : [],
        followups: followups.map((m) => ({
          id: m.id,
          title: m.title,
          status: m.status,
          result: m.result,
        })),
        canManage:
          current.profile.permissions.includes("management:followup:manage") &&
          actualManager(data, current, task.projectId, task.teamId),
        related,
      }
    })
  }
  save(actor: Actor, id: number, input: FeedbackInput | FeedbackVoidInput, voiding = false) {
    return this.repository.run(actor, true, async (data, tx) => {
      const current = data.actor!,
        task = feedbackTask(data, current, id)
      feedbackOwner(data, current, task, this.now())
      const old = data.feedback.find((f) => f.taskId === id)
      if (old) {
        const result = replay(data, "task_feedback", old.id, current.user.id, input)
        if (result) return result
      }
      if (!applicableFeedback(data, task, this.now()))
        throw AppError.conflict("仅已实际结束且未取消的集体服务可登记反馈")
      assertVersion(old?.version ?? 0, input.version)
      if ((old || voiding) && !input.reason?.trim())
        throw AppError.badRequest("请填写更正、恢复或作废原因")
      if (voiding && (!old || old.status === "VOID"))
        throw AppError.conflict("没有可作废的有效反馈")
      const values = voiding
        ? { status: "VOID" as const, voidReason: input.reason! }
        : (() => {
            const form = input as FeedbackInput
            validateFeedback(
              form,
              data.executions.sessions.find((s) => s.taskId === id)!.endedAt!,
              this.now(),
            )
            const { version: _, requestKey: __, reason: ___, ...fields } = form
            void _
            void __
            void ___
            return { ...fields, status: "ACTIVE" as const, voidReason: "" }
          })()
      const version = (old?.version ?? 0) + 1
      const form = input as FeedbackInput
      const rowId =
        old?.id ??
        (await tx.insert({
          satisfiedCount: form.satisfiedCount,
          neutralCount: form.neutralCount,
          dissatisfiedCount: form.dissatisfiedCount,
          source: form.source,
          sourceNote: form.sourceNote,
          feedbackDate: form.feedbackDate,
          suggestions: form.suggestions,
          taskId: id,
          createdBy: current.user.id,
          updatedBy: current.user.id,
        }))
      if (old) await tx.update(rowId, { ...values, updatedBy: current.user.id, version })
      const result = { id: rowId, version }
      await tx.audit({
        actorId: current.user.id,
        entityType: "task_feedback",
        entityId: rowId,
        action: voiding
          ? "void-feedback"
          : !old
            ? "create-feedback"
            : old.status === "VOID"
              ? "restore-feedback"
              : "correct-feedback",
        beforeData: old ?? null,
        afterData: {
          value: values,
          reason: input.reason ?? "",
          requestKey: input.requestKey,
          hash: fingerprint(input),
          result,
        },
      })
      return result
    })
  }
}
