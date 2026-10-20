import {
  identityService,
  type IdentityService,
  validateServiceField,
} from "@/modules/identity/identity.service"
import { assertVersion, safeUser, type Actor } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { hashPassword, verifyPassword } from "@/utils/password"
import { AuthRepository } from "./auth.repository"

export interface RegistrationInput {
  username: string
  password: string
  name: string
  phone: string
  arrivalDate: string
  major: string
  proposedPosition: string
  education: string
  politicalStatus: string
  socialWorkerNo?: string | null
  serviceFieldCode?: string | null
  proposedTeam?: string | null
}
export type ProfileInput = Partial<Omit<RegistrationInput, "username" | "password">> & {
  version: number
}

/** 处理本人账号流程；任职安排、审核和授权由 IdentityService 负责。 */
export class AuthService {
  constructor(
    readonly repository = new AuthRepository(),
    readonly identities: IdentityService = identityService,
  ) {}
  /** 注册只保存申请资料和密码哈希，PENDING 状态使用 users 表的默认值。 */
  async register(input: RegistrationInput) {
    validateServiceField(input.serviceFieldCode)
    const { password, ...fields } = input
    return this.repository.register({ ...fields, passwordHash: await hashPassword(password) })
  }
  /** 待审核和被驳回账号也可登录查看结果，实际业务访问由认证插件继续限制。 */
  async login(username: string, password: string) {
    const user = await this.repository.findUsername(username)
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      throw AppError.badRequest("账号或密码不正确")
    if (user.status === "DISABLED" || user.status === "LEFT")
      throw AppError.forbidden("账号已停用，请联系管理员")
    const actor = await this.identities.actor(user.id)
    // 验密期间密码或账号状态变化时，不以旧密码签发新版本凭证。
    if (
      actor.user.authVersion !== user.authVersion ||
      actor.user.passwordHash !== user.passwordHash
    )
      throw AppError.tokenExpired()
    await this.repository.record(user.id, "login")
    return actor
  }
  profile(actor: Actor) {
    return { ...safeUser(actor.user), ...actor.profile }
  }
  /** 申请阶段可修改申请资料；启用后仅允许自助维护白名单中的普通联系资料。 */
  updateProfile(actor: Actor, input: ProfileInput) {
    validateServiceField(input.serviceFieldCode)
    return this.repository.changeUser(
      actor.user.id,
      actor.user.id,
      "update-profile",
      (_state, target) => {
        if (
          target.authVersion !== actor.user.authVersion ||
          target.status === "DISABLED" ||
          target.status === "LEFT"
        )
          throw AppError.tokenExpired()
        const { version, ...fields } = input
        assertVersion(target.version, version)
        if (
          target.status === "ACTIVE" &&
          Object.keys(fields).some(
            (key) => !["phone", "socialWorkerNo", "serviceFieldCode"].includes(key),
          )
        )
          throw AppError.forbidden("任职和身份资料请由管理员维护")
        return { patch: fields }
      },
    )
  }
  /** 重提复用原账号，清空本次展示的驳回意见，历史审核过程仍保存在审计日志中。 */
  resubmit(actor: Actor, version: number) {
    return this.repository.changeUser(
      actor.user.id,
      actor.user.id,
      "resubmit-registration",
      (_state, target) => {
        if (target.authVersion !== actor.user.authVersion) throw AppError.tokenExpired()
        assertVersion(target.version, version)
        if (target.status !== "REJECTED") throw AppError.conflict("仅被驳回的申请可重新提交")
        return { patch: { status: "PENDING", reviewComment: null } }
      },
    )
  }
  async password(actor: Actor, oldPassword: string, newPassword: string) {
    if (!(await verifyPassword(oldPassword, actor.user.passwordHash)))
      throw AppError.badRequest("原密码不正确")
    // 哈希计算在事务外完成，缩短持锁时间；事务内再检查认证版本，防止并发改密覆盖。
    const passwordHash = await hashPassword(newPassword)
    await this.repository.changeUser(
      actor.user.id,
      actor.user.id,
      "change-password",
      (_state, target) => {
        if (target.authVersion !== actor.user.authVersion || target.status !== "ACTIVE")
          throw AppError.tokenExpired()
        return { patch: { passwordHash, authVersion: target.authVersion + 1 } }
      },
    )
    return null
  }
}
export const authService = new AuthService()
