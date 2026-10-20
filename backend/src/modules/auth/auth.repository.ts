import { identityRepository, type IdentityRepository } from "@/modules/identity/identity.repository"

/** 认证复用同一身份仓储，保证审核与凭证状态读取一致。 */
export class AuthRepository {
  constructor(readonly identity: IdentityRepository = identityRepository) {}
  /** 按登录账号读取原始人员记录，供服务层校验密码及账号状态。 */
  findUsername(username: string) {
    return this.identity.findUsername(username)
  }
  /** 复用身份仓储创建待审核账号，并将注册日志与账号一起写入。 */
  register(...args: Parameters<IdentityRepository["register"]>) {
    return this.identity.register(...args)
  }
  /** 转交人员变更事务，保持本人操作与管理员操作使用同一套持久化规则。 */
  changeUser(...args: Parameters<IdentityRepository["changeUser"]>) {
    return this.identity.changeUser(...args)
  }
  /** 记录登录或退出等账号操作，不保存凭证内容。 */
  record(...args: Parameters<IdentityRepository["record"]>) {
    return this.identity.record(...args)
  }
}
