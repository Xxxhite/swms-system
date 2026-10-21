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
  /** 月度预警分页查询，包含合同与团队统计层级。 */
  async warnings(actor: Actor, q: BusinessQuery) {
    return pageResult(await this.service.progress(actor, q, "analysis:report:view"), q)
  }
  /** 从一次数据库快照取得所有授权筛选结果后生成 Excel。 */
  async export(actor: Actor, q: BusinessQuery) {
    return exportIndicators(await this.service.progress(actor, q, "analysis:report:export"))
  }
}
