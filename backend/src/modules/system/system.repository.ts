import {
  identityRepository,
  type IdentityRepository,
  type ListQuery,
} from "@/modules/identity/identity.repository"
/** 系统管理仓储：复用身份仓储的审计查询，避免维护两套日志访问逻辑。 */
export class SystemRepository {
  constructor(readonly identity: IdentityRepository = identityRepository) {}
  /** 将分页和筛选参数交给统一审计查询实现。 */
  logs(query: ListQuery, filters: Parameters<IdentityRepository["logs"]>[1]) {
    return this.identity.logs(query, filters)
  }
}
