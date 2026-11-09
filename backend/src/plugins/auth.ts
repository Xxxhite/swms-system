import { jwt } from "@elysiajs/jwt"
import { Elysia, t } from "elysia"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { AppError } from "@/utils/errors"
import { env } from "@/utils/env"

/** 声明路由的账号要求；受限账号仅访问本人资料、申请和退出等白名单。 */
export type AuthenticationMode = "active" | "restricted"

/** 提供声明式认证及类型化 actor，保留 authenticate 供尚未迁移的路由使用。 */
export function createAuthentication(
  identities: IdentityService = identityService,
  secret = env.jwtSecret,
) {
  const tokens = jwt({
    name: "jwt",
    secret: secret || crypto.randomUUID(),
    schema: t.Object({ authVersion: t.Integer() }),
  })
  const authenticate = async (authorization: string | undefined, allowRestricted = false) => {
    if (!secret) throw AppError.unauthorized("请先配置后端认证密钥")
    if (!authorization?.startsWith("Bearer ")) throw AppError.unauthorized()
    const payload = await tokens.decorator.jwt.verify(authorization.slice(7))
    if (!payload || !payload.sub || !Number.isSafeInteger(Number(payload.sub)))
      throw AppError.tokenExpired()
    // 每次请求重新读取账号版本、状态和有效授权，改密、停用后旧凭证立即失效。
    const actor = await identities.actor(Number(payload.sub))
    if (
      actor.user.authVersion !== payload.authVersion ||
      actor.user.status === "DISABLED" ||
      actor.user.status === "LEFT"
    )
      throw AppError.tokenExpired()
    if (!allowRestricted && actor.user.status !== "ACTIVE")
      throw AppError.forbidden("账号尚未通过审核")
    return actor
  }

  return new Elysia({ name: "authentication" })
    .use(tokens)
    .derive({ as: "scoped" }, ({ headers }) => ({
      // 仅本人资料、申请重提等白名单接口显式传 true，允许待审核或被驳回账号访问。
      authenticate: (allowRestricted = false) =>
        authenticate(headers.authorization, allowRestricted),
    }))
    .macro({
      auth: (mode: AuthenticationMode) => ({
        resolve: async ({ headers }) => ({
          actor: await authenticate(headers.authorization, mode === "restricted"),
        }),
      }),
    })
}
