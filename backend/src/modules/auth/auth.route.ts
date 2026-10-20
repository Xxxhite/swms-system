import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { authService, type AuthService } from "./auth.service"
import { registrationFields, password, text, version } from "@/modules/identity/identity.validation"
import { env } from "@/utils/env"
import { AppError } from "@/utils/errors"
import { ok } from "@/utils/response"

/** 创建认证路由：声明注册、登录、本人资料及改密接口，并按账号状态选择鉴权方式。 */
export function createAuthRoutes(service: AuthService = authService) {
  return new Elysia({ prefix: "/auth", tags: ["基本信息"] })
    .use(createAuthentication(service.identities))
    .post("/register", async ({ body }) => ok(await service.register(body)), {
      body: t.Object({
        ...registrationFields,
        username: t.String({ pattern: "^[a-z0-9_]{3,32}$" }),
        password,
      }),
    })
    .post(
      "/login",
      async ({ body, jwt }) => {
        if (!env.jwtSecret) throw AppError.unauthorized("请先配置后端认证密钥")
        const actor = await service.login(body.username, body.password)
        const token = await jwt.sign({
          sub: String(actor.user.id),
          authVersion: actor.user.authVersion,
          exp: Math.floor(Date.now() / 1000) + env.jwtExpiresSeconds,
          iat: true,
        })
        return ok({ token, user: actor.profile })
      },
      {
        body: t.Object({
          username: text(32),
          password: t.String({ minLength: 1, maxLength: 128 }),
        }),
      },
    )
    .get("/profile", async ({ authenticate }) => ok(service.profile(await authenticate(true))))
    .put(
      "/profile",
      async ({ authenticate, body }) =>
        ok(await service.updateProfile(await authenticate(true), body)),
      { body: t.Intersect([t.Object(version), t.Partial(t.Object(registrationFields))]) },
    )
    .post(
      "/registration/submit",
      async ({ authenticate, body }) =>
        ok(await service.resubmit(await authenticate(true), body.version)),
      { body: t.Object(version) },
    )
    .put(
      "/password",
      async ({ authenticate, body }) =>
        ok(await service.password(await authenticate(), body.oldPassword, body.newPassword)),
      { body: t.Object({ oldPassword: text(128), newPassword: password }) },
    )
    .post("/logout", async ({ authenticate }) => {
      const actor = await authenticate(true)
      await service.repository.record(actor.user.id, "logout")
      return ok(null)
    })
}
