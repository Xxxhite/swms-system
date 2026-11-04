import type { BusinessState } from "@/modules/project/project.repository"
import { taskState } from "@/modules/task/task-calendar"
export function outcomeTaskState(data: BusinessState, taskId: number) {
  const task = data.scheduling.tasks.find((t) => t.id === taskId)!,
    session = data.executions.sessions.find((s) => s.taskId === taskId),
    outcome = data.outcomes.outcomes.find((o) => o.taskId === taskId)
  if (!session) return { ...taskState(task.status === "CANCELED"), sourceChanged: false }
  const required = session.snapshot.indicators.length || 1
  let approved = 0,
    pending = 0,
    rejected = 0,
    sourceChanged = false
  if (session.snapshot.indicators.length)
    for (const indicator of session.snapshot.indicators) {
      const link = data.outcomes.links.find(
          (l) => l.taskId === taskId && l.indicatorId === indicator.indicatorId,
        ),
        report = data.reports.find((r) => r.id === link?.recordId),
        review = data.outcomes.reviews.find((r) => r.id === link?.effectiveReviewId),
        snapshot = data.outcomes.snapshots.find((s) => s.id === review?.snapshotId)
      const fresh =
        snapshot?.sourceVersion === session.sourceVersion &&
        snapshot.data.taskVersion === task.version
      if (report?.status === "SUBMITTED" && fresh) approved++
      if (snapshot && !fresh) sourceChanged = true
      if (
        report?.status === "IN_REVIEW" ||
        data.changes.some((c) => c.pendingReportId === report?.id)
      )
        pending++
      if (report?.status === "REJECTED") rejected++
    }
  else if (outcome) {
    const snapshot = data.outcomes.snapshots.find(
      (s) => s.id === outcome.effectiveSummarySnapshotId,
    )
    if (
      snapshot?.sourceVersion === session.sourceVersion &&
      snapshot.data.taskVersion === task.version
    )
      approved = 1
    if (snapshot && !approved) sourceChanged = true
    pending = outcome.summaryStatus === "IN_REVIEW" ? 1 : 0
    rejected = outcome.summaryStatus === "REJECTED" && !approved ? 1 : 0
  }
  return {
    ...taskState(task.status === "CANCELED", {
      started: true,
      ended: session.status !== "IN_PROGRESS",
      required,
      approved,
      pending,
      rejected,
    }),
    sourceChanged,
  }
}
