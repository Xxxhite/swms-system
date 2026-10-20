import { jwt } from "@elysiajs/jwt"
import { Elysia, t } from "elysia"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { AppError } from "@/utils/errors"
import { env } from "@/utils/env"

/** 为路由注入 authenticate：校验凭证后，从数据库重新计算当前权限和数据范围。 */
export function createAuthentication(identities: IdentityService = identityService) {
  return new Elysia({ name: "authentication" })
    .use(
      jwt({
        name: "jwt",
        secret: env.jwtSecret || crypto.randomUUID(),
        schema: t.Object({ authVersion: t.Integer() }),
      }),
    )
    .derive({ as: "scoped" }, ({ headers, jwt }) => ({
      // 仅本人资料、申请重提等白名单接口显式传 true，允许待审核或被驳回账号访问。
      authenticate: async (allowRestricted = false) => {
        if (!env.jwtSecret) throw AppError.unauthorized("请先配置后端认证密钥")
        const header = headers.authorization
        if (!header?.startsWith("Bearer ")) throw AppError.unauthorized()
        const payload = await jwt.verify(header.slice(7))
        if (!payload || !payload.sub || !Number.isSafeInteger(Number(payload.sub)))
          throw AppError.tokenExpired()
        // JWT 只携带账号标识和认证版本，角色调整后下一次请求即使用最新授权。
        const actor = await identities.actor(Number(payload.sub))
        // 改密、停用等操作递增 authVersion，使已签发的所有旧凭证一起失效。
        if (
          actor.user.authVersion !== payload.authVersion ||
          actor.user.status === "DISABLED" ||
          actor.user.status === "LEFT"
        )
          throw AppError.tokenExpired()
        if (!allowRestricted && actor.user.status !== "ACTIVE")
          throw AppError.forbidden("账号尚未通过审核")
        return actor
      },
    }))
}
