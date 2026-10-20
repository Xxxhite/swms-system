import { requireAdmin, type Actor } from "@/utils/authorization"
import type { ListQuery } from "@/modules/identity/identity.repository"
import { SystemRepository } from "./system.repository"
import { AppError } from "@/utils/errors"
/** 系统管理服务：校验日志访问权限和筛选参数后交给仓储查询。 */
export class SystemService {
  constructor(readonly repository = new SystemRepository()) {}
  /** 仅允许具备日志权限的管理员查询，并检查起止日期顺序。 */
  logs(actor: Actor, query: ListQuery, filters: Parameters<SystemRepository["logs"]>[1]) {
    requireAdmin(actor, "system:log:view")
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
      throw AppError.badRequest("开始日期应不晚于结束日期")
    return this.repository.logs(query, filters)
  }
}
