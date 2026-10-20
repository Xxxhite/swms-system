import {
  identityRepository,
  type IdentityRepository,
  type ListQuery,
} from "@/modules/identity/identity.repository"
export class SystemRepository {
  constructor(readonly identity: IdentityRepository = identityRepository) {}
  logs(query: ListQuery, filters: Parameters<IdentityRepository["logs"]>[1]) {
    return this.identity.logs(query, filters)
  }
}
