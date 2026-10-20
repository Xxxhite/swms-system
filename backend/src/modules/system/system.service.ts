import { requireAdmin, type Actor } from "@/utils/authorization"
import type { ListQuery } from "@/modules/identity/identity.repository"
import { SystemRepository } from "./system.repository"
import { AppError } from "@/utils/errors"
export class SystemService {
  constructor(readonly repository = new SystemRepository()) {}
  logs(actor: Actor, query: ListQuery, filters: Parameters<SystemRepository["logs"]>[1]) {
    requireAdmin(actor, "system:log:view")
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
      throw AppError.badRequest("开始日期应不晚于结束日期")
    return this.repository.logs(query, filters)
  }
}
