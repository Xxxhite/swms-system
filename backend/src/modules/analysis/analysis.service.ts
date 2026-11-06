import { ManagementRepository } from "@/modules/management/management.repository"
import { calculateReport } from "./management.calculation"
import { exportManagement } from "./management.export"
import type { ReportKind, ReportQuery } from "./management.validation"
import { AppError } from "@/utils/errors"
import { requirePermission } from "@/utils/authorization"
import { ServiceService } from "@/modules/service/service.service"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { pageResult, type BusinessQuery } from "@/modules/project/project.validation"
import type { Actor } from "@/utils/authorization"
import { exportIndicators } from "./analysis.export"
/** 预警和导出复用同一范围及计算服务，导出不受当前页码限制。 */
export class AnalysisService {
  readonly service: ServiceService
  constructor(repository: ProjectRepository = projectRepository) {
    this.service = new ServiceService(repository)
  }
  management(
    actor: Actor,
    kind: ReportKind,
    q: ReportQuery,
    mode: "query" | "details" | "export" = "query",
  ) {
    return new ManagementRepository(this.service.repository.database).run(
      actor,
      false,
      async (data) => {
        if (mode !== "query" && !q.fingerprint)
          throw AppError.badRequest("请先查询报表后再查看明细或导出")
        if (mode === "export") requirePermission(data.actor!, "analysis:report:export")
        const report = calculateReport(data, data.actor!, kind, q)
        if (mode === "export") return exportManagement(report)
        const rows = mode === "details" && q.rowKey ? (report.details[q.rowKey] ?? []) : report.rows
        const page = q.page ?? 1,
          pageSize = q.pageSize ?? 20
        return {
          ...report,
          rows: undefined,
          details: undefined,
          list: rows.slice((page - 1) * pageSize, page * pageSize),
          total: rows.length,
          page,
          pageSize,
        }
      },
    )
  }
  /** 月度预警分页查询，包含合同与团队统计层级。 */
  async warnings(actor: Actor, q: BusinessQuery) {
    return pageResult(await this.service.progress(actor, q, "analysis:report:view"), q)
  }
  /** 从一次数据库快照取得所有授权筛选结果后生成 Excel。 */
  async export(actor: Actor, q: BusinessQuery) {
    return exportIndicators(await this.service.progress(actor, q, "analysis:report:export"))
  }
}
