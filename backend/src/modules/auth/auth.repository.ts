import { identityRepository, type IdentityRepository } from "@/modules/identity/identity.repository"

/** 认证复用同一身份仓储，保证审核与凭证状态读取一致。 */
export class AuthRepository {
  constructor(readonly identity: IdentityRepository = identityRepository) {}
  findUsername(username: string) {
    return this.identity.findUsername(username)
  }
  register(...args: Parameters<IdentityRepository["register"]>) {
    return this.identity.register(...args)
  }
  changeUser(...args: Parameters<IdentityRepository["changeUser"]>) {
    return this.identity.changeUser(...args)
  }
  record(...args: Parameters<IdentityRepository["record"]>) {
    return this.identity.record(...args)
  }
}
