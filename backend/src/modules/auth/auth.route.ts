import { Elysia } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { authService, type AuthService } from "./auth.service"
import { env } from "@/utils/env"
import { AppError } from "@/utils/errors"
import { ok } from "@/utils/response"
import {
  loginBody,
  passwordBody,
  profileBody,
  registrationBody,
  registrationSubmitBody,
} from "./auth.validation"

/** 创建认证路由：声明注册、登录、本人资料及改密接口，并按账号状态选择鉴权方式。 */
export function createAuthRoutes(service: AuthService = authService) {
  return new Elysia({ prefix: "/auth", tags: ["基本信息"] })
    .use(createAuthentication(service.identities))
    .post("/register", async ({ body }) => ok(await service.register(body)), {
      body: registrationBody,
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
        body: loginBody,
      },
    )
    .get("/profile", ({ actor }) => ok(service.profile(actor)), { auth: "restricted" })
    .put("/profile", async ({ actor, body }) => ok(await service.updateProfile(actor, body)), {
      auth: "restricted",
      body: profileBody,
    })
    .post(
      "/registration/submit",
      async ({ actor, body }) => ok(await service.resubmit(actor, body.version)),
      { auth: "restricted", body: registrationSubmitBody },
    )
    .put(
      "/password",
      async ({ actor, body }) =>
        ok(await service.password(actor, body.oldPassword, body.newPassword)),
      { auth: "active", body: passwordBody },
    )
    .post("/logout", async ({ actor }) => ok(await service.logout(actor)), { auth: "restricted" })
}
