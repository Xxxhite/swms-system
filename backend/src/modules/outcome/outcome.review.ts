import type {
  BusinessState,
  BusinessConnection,
  ProjectRepository,
} from "@/modules/project/project.repository"
import { requirePermission, assertVersion, type Actor } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { fingerprint } from "@/modules/task/task-calendar"
import { calculateOutcome } from "./outcome.calculation"
import { outcomeFresh } from "./outcome.authorization"
import { sourceView } from "./outcome.service"
import type { OutcomeReviewInput } from "./outcome.validation"
import type { OutcomeMeasure } from "@/db/schema/outcome"

export function outcomeContext(data: BusinessState, instance: BusinessState["instances"][number]) {
  const reference = instance.businessSnapshot as Record<string, unknown>,
    snapshot = data.outcomes.snapshots.find((s) => s.id === reference.outcomeSnapshotId)
  if (!snapshot) {
    if (reference.outcomeSnapshotId || instance.businessType === "TASK_SUMMARY")
      throw AppError.conflict("本次审批的来源快照缺失")
    return null
  }
  const outcome = data.outcomes.outcomes.find((o) => o.id === snapshot.outcomeId),
    link = data.outcomes.links.find((l) => l.id === reference.outcomeRecordLinkId)
  if (!outcome || outcome.id !== reference.outcomeId || snapshot.data.taskId !== outcome.taskId)
    throw AppError.conflict("来源快照关联不一致")
  if (instance.businessType === "TASK_SUMMARY") {
    if (instance.businessId !== outcome.id || link || snapshot.data.rules.length)
      throw AppError.conflict("总结审批来源不匹配")
  } else {
    const reportId =
      instance.businessType === "SERVICE_SUBMISSION"
        ? instance.businessId
        : data.changes.find(
            (c) => c.id === instance.businessId && instance.businessType === "SERVICE_CHANGE",
          )?.reportId
    if (!link || link.outcomeId !== outcome.id || link.recordId !== reportId)
      throw AppError.conflict("档案来源与本次审批不匹配")
  }
  return { reference, snapshot, outcome, link }
}
export function reviewOutcome(
  data: BusinessState,
  task: BusinessState["tasks"][number],
  instance: BusinessState["instances"][number],
  input: OutcomeReviewInput,
) {
  const context = outcomeContext(data, instance)
  if (!context) throw AppError.badRequest("该审批不是任务来源成果")
  assertVersion(task.version, input.version)
  outcomeFresh(data, context.snapshot)
  const rule = context.snapshot.data.rules.find((r) => r.indicatorId === context.link?.indicatorId)
  if (context.link && !rule) throw AppError.conflict("快照中缺少指标口径")
  for (const file of context.snapshot.data.evidence)
    if (
      !data.executions.evidence.some(
        (f) =>
          f.id === file.id &&
          !f.deletedAt &&
          f.sha256 === file.sha256 &&
          f.taskId === context.snapshot.data.taskId,
      )
    )
      throw AppError.conflict("本次来源凭证不完整，请重新整理")
  const calculated = calculateOutcome(
    context.snapshot.data,
    rule?.mode ?? "MANUAL",
    input.decisions,
    rule?.manualValue ?? "0.00",
    true,
    rule?.indicatorId,
  )
  const measure: OutcomeMeasure =
    context.reference.operation === "DELETE"
      ? { mode: rule?.mode ?? "MANUAL", value: "0.00", people: [], intervals: [] }
      : calculated
  const declaredValue = String(context.reference.proposedValue ?? "0.00")
  const previewToken = fingerprint({
    taskId: task.id,
    version: task.version,
    snapshotId: context.snapshot.id,
    fingerprint: context.snapshot.fingerprint,
    decisions: input.decisions,
    measure,
  })
  return {
    context,
    measure,
    declaredValue,
    previewToken,
    difference: measure.value !== declaredValue,
  }
}
export async function applyOutcomeReview(
  tx: BusinessConnection,
  data: BusinessState,
  actor: Actor,
  task: BusinessState["tasks"][number],
  instance: BusinessState["instances"][number],
  input: OutcomeReviewInput,
) {
  const preview = reviewOutcome(data, task, instance, input)
  if (preview.previewToken !== input.previewToken)
    throw AppError.conflict("核验内容或来源已变化，请重新预览")
  if (preview.difference && !input.comment?.trim())
    throw AppError.badRequest("核定量与申报量不同，请填写差异说明")
  const reviewId = await tx.outcomes.reviews.insert({
    approvalTaskId: task.id,
    snapshotId: preview.context.snapshot.id,
    recordLinkId: preview.context.link?.id ?? null,
    reviewerId: actor.user.id,
    decisions: input.decisions,
    declaredValue: preview.declaredValue,
    measure: preview.measure,
    reason: input.comment ?? "",
  })
  if (preview.context.link && preview.context.snapshot.data.registration)
    await tx.monthlyReports.update(preview.context.link.recordId, {
      serviceDate: preview.context.snapshot.data.date,
      month: preview.context.snapshot.data.date.slice(0, 7),
    })
  if (preview.context.link)
    await tx.outcomes.links.update(preview.context.link.id, {
      effectiveReviewId: reviewId,
      version: preview.context.link.version + 1,
    })
  else
    await tx.outcomes.outcomes.update(preview.context.outcome.id, {
      summaryStatus: "SUBMITTED",
      effectiveSummarySnapshotId: preview.context.snapshot.id,
      version: preview.context.outcome.version + 1,
    })
  return preview.measure.value
}
export class OutcomeReviewService {
  constructor(readonly repository: ProjectRepository) {}
  preview(actor: Actor, id: number, input: OutcomeReviewInput) {
    return this.repository.approvals(actor, (data) => {
      requirePermission(data.actor!, "service:monthly:approve")
      const task = data.tasks.find((t) => t.id === id && t.approverId === actor.user.id),
        instance = data.instances.find(
          (i) => i.id === task?.instanceId && i.applicantId !== actor.user.id,
        )
      if (!task || !instance) throw AppError.notFound()
      if (task.status !== "PENDING" || instance.status !== "IN_REVIEW")
        throw AppError.conflict("审批任务已处理")
      const result = reviewOutcome(data, task, instance, input)
      return {
        value: result.measure.value,
        declaredValue: result.declaredValue,
        difference: result.difference,
        previewToken: result.previewToken,
        source: sourceView(result.context.snapshot.data, data.actor!),
      }
    })
  }
}
