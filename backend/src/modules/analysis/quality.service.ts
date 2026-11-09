import type { Actor } from "@/utils/authorization"
import { requirePermission } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { feedbackRepository, type FeedbackRepository } from "@/modules/feedback/feedback.repository"
import { calculateQuality } from "./quality.calculation"
import { exportQuality } from "./quality.export"
import type { QualityKind, QualityQuery } from "./quality.validation"
export class QualityService {
  constructor(readonly repository: FeedbackRepository = feedbackRepository) {}
  report(
    actor: Actor,
    kind: QualityKind,
    q: QualityQuery,
    mode: "query" | "details" | "export" = "query",
  ) {
    return this.repository.run(actor, false, async (data) => {
      if (mode !== "query" && !q.fingerprint) throw AppError.badRequest("请先查询质量报告")
      if (mode === "export") requirePermission(data.actor!, "analysis:report:export")
      const report = calculateQuality(data, data.actor!, kind, q)
      if (mode === "export") return exportQuality(report)
      const page = q.page ?? 1,
        pageSize = q.pageSize ?? 20
      return {
        ...report,
        rows: undefined,
        list: report.rows.slice((page - 1) * pageSize, page * pageSize),
        total: report.rows.length,
        page,
        pageSize,
      }
    })
  }
}
