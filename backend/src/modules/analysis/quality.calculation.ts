import type { Actor } from "@/utils/authorization"
import { requirePermission } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import type { FeedbackState } from "@/modules/feedback/feedback.repository"
import { applicableFeedback, feedbackTask } from "@/modules/feedback/feedback.authorization"
import {
  evaluationReadable,
  evaluationApplicable,
} from "@/modules/resource/resource.evaluation.authorization"
import { relationship } from "@/modules/resource/resource.service"
import { fingerprint, businessDate } from "@/modules/task/task-calendar"
import type { QualityKind, QualityQuery } from "./quality.validation"
export const ratingLabels = {
  SATISFIED: "满意",
  GENERAL: "一般",
  NEEDS_IMPROVEMENT: "待改进",
  UNRATED: "未评价",
}
export type QualityRow = {
  id: number
  title: string
  projectName: string
  teamName: string
  date: string
  status: string
  samples: number
  satisfied: number
  neutral: number
  dissatisfied: number
  suggestions: string
  href: string
  version: number
}
export function qualitySummary(rows: QualityRow[], kind: QualityKind) {
  const evaluated = rows.filter((r) => r.status !== "UNRATED"),
    samples = evaluated.reduce((n, r) => n + r.samples, 0)
  const satisfied = evaluated.reduce((n, r) => n + r.satisfied, 0),
    neutral = evaluated.reduce((n, r) => n + r.neutral, 0),
    dissatisfied = evaluated.reduce((n, r) => n + r.dissatisfied, 0)
  return {
    total: rows.length,
    evaluated: evaluated.length,
    coverage: rows.length ? ((100 * evaluated.length) / rows.length).toFixed(2) : null,
    samples,
    satisfied,
    neutral,
    dissatisfied,
    satisfaction: samples && kind === "service" ? ((100 * satisfied) / samples).toFixed(2) : null,
  }
}
export function calculateQuality(
  data: FeedbackState,
  actor: Actor,
  kind: QualityKind,
  input: QualityQuery,
  now = new Date(),
) {
  requirePermission(actor, "analysis:report:view")
  requirePermission(actor, kind === "service" ? "service:feedback:view" : "resource:view")
  const { page: _, pageSize: __, fingerprint: ___, ...raw } = input
  void _
  void __
  void ___
  if (input.pageSize && ![10, 20, 50, 100].includes(input.pageSize))
    throw AppError.badRequest("请选择10、20、50或100条")
  const filters = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""),
  )
  if (kind === "cooperation" && (input.dateFrom || input.dateTo || input.teamId))
    throw AppError.badRequest("合作评价使用当前覆盖率，请清除服务日期与团队筛选")
  if (kind === "service" && (input.resourceId || input.relationship || input.rating))
    throw AppError.badRequest("服务反馈请使用项目、团队和实际服务日期筛选")
  if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo)
    throw AppError.badRequest("开始日期不得晚于结束日期")
  const rows: QualityRow[] = []
  if (kind === "service") {
    requirePermission(actor, "service:execution:view")
    for (const t of data.scheduling.tasks) {
      if (
        !applicableFeedback(data, t, now) ||
        (input.projectId && t.projectId !== input.projectId) ||
        (input.teamId && t.teamId !== input.teamId)
      )
        continue
      try {
        feedbackTask(data, actor, t.id)
      } catch {
        continue
      }
      const date = businessDate(data.executions.sessions.find((s) => s.taskId === t.id)!.endedAt!)
      if ((input.dateFrom && date < input.dateFrom) || (input.dateTo && date > input.dateTo))
        continue
      const f = data.feedback.find((f) => f.taskId === t.id && f.status === "ACTIVE")
      rows.push({
        id: t.id,
        title: t.title,
        projectName: data.projects.find((p) => p.id === t.projectId)?.name ?? "",
        teamName: data.identity.orgs.find((o) => o.id === t.teamId)?.name ?? "",
        date,
        status: f ? "ACTIVE" : "UNRATED",
        samples: f ? f.satisfiedCount + f.neutralCount + f.dissatisfiedCount : 0,
        satisfied: f?.satisfiedCount ?? 0,
        neutral: f?.neutralCount ?? 0,
        dissatisfied: f?.dissatisfiedCount ?? 0,
        suggestions: f?.suggestions ?? "",
        href: `/activity/${t.id}`,
        version: f?.version ?? 0,
      })
    }
  } else {
    for (const c of data.cooperations) {
      if (
        !evaluationReadable(data, actor, c) ||
        !evaluationApplicable(c, businessDate(now)) ||
        (input.projectId && c.projectId !== input.projectId) ||
        (input.resourceId && c.resourceId !== input.resourceId)
      )
        continue
      const related = data.cooperations.filter(
        (x) => x.resourceId === c.resourceId && evaluationReadable(data, actor, x),
      )
      if (input.relationship && relationship(related, businessDate(now)) !== input.relationship)
        continue
      const rating = c.feedbackRating && c.feedbackBy && c.feedbackAt ? c.feedbackRating : "UNRATED"
      if (input.rating && rating !== input.rating) continue
      rows.push({
        id: c.id,
        title: c.title,
        projectName: data.projects.find((p) => p.id === c.projectId)?.name ?? "独立合作",
        teamName: data.resources.find((r) => r.id === c.resourceId)?.name ?? "",
        date: c.feedbackAt ? businessDate(c.feedbackAt) : "",
        status: rating,
        samples: rating === "UNRATED" ? 0 : 1,
        satisfied: rating === "SATISFIED" ? 1 : 0,
        neutral: rating === "GENERAL" ? 1 : 0,
        dissatisfied: rating === "NEEDS_IMPROVEMENT" ? 1 : 0,
        suggestions: c.feedback,
        href: `/resource/${c.resourceId}?cooperationId=${c.id}`,
        version: c.version,
      })
    }
  }
  const selected = rows.filter(
    (r) => !input.keyword || `${r.title} ${r.projectName} ${r.teamName}`.includes(input.keyword),
  )
  const summary = qualitySummary(selected, kind)
  const hash = fingerprint({
    kind,
    filters,
    rows: selected,
    summary,
    actor: actor.user.id,
    permissions: actor.profile.permissions,
  })
  if (input.fingerprint && input.fingerprint !== hash)
    throw AppError.conflict("数据或权限已变化，请刷新质量报告")
  return {
    kind,
    title: kind === "service" ? "服务质量反馈" : "合作评价",
    rows: selected,
    summary,
    meta: {
      filters,
      fingerprint: hash,
      generatedAt: now.toISOString(),
      basis:
        kind === "service"
          ? "按实际服务结束日统计已结束且未取消的集体任务；份数为反馈样本，满意占比按总份数加权。"
          : "按当前有权且已发生实际合作的事项统计；旧文本无评价等级时列为未评价。",
    },
  }
}
