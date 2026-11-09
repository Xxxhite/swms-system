import { t, type Static } from "elysia"

import { password, registrationFields, text, version } from "@/modules/identity/identity.validation"

/** 认证接口的模型与静态类型共用一份定义，业务服务只接收已校验的数据。 */
export const registrationBody = t.Object({
  ...registrationFields,
  username: t.String({
    pattern: "^[a-z0-9_]{3,32}$",
    error: "账号为 3—32 位小写字母、数字或下划线",
  }),
  password,
})

export const loginBody = t.Object({
  username: text(32),
  password: t.String({ minLength: 1, maxLength: 128 }),
})

export const profileBody = t.Intersect([t.Object(version), t.Partial(t.Object(registrationFields))])

export const registrationSubmitBody = t.Object(version)

export const passwordBody = t.Object({ oldPassword: text(128), newPassword: password })

export type RegistrationInput = Static<typeof registrationBody>
export type ProfileInput = Static<typeof profileBody>
