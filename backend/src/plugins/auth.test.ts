import { describe, expect, test } from "bun:test"
import { jwt } from "@elysiajs/jwt"
import { Elysia, t } from "elysia"

import { actorFrom, IdentityService } from "@/modules/identity/identity.service"
import { AppError } from "@/utils/errors"
import { ok } from "@/utils/response"
import type { Actor, User } from "@/utils/authorization"
import { createAuthentication } from "./auth"
import { errorHandler } from "./error-handler"

const secret = "authentication-unit-test-secret"
const signer = jwt({ secret, name: "signer", schema: t.Object({ authVersion: t.Integer() }) })

function user(status: User["status"] = "ACTIVE"): User {
  return {
    id: 1,
    username: "auth_fixture",
    passwordHash: "not-used-by-token-validation",
    name: "认证测试人员",
    phone: "13800000000",
    arrivalDate: "2026-01-01",
    major: "社会工作",
    socialWorkerNo: null,
    serviceFieldCode: null,
    serviceFieldCodes: [],
    isSupervisor: false,
    proposedPosition: "社工",
    proposedTeam: null,
    orgId: null,
    positionCode: null,
    education: "本科",
    politicalStatus: "群众",
    supervisorId: null,
    dataScope: "SELF",
    status,
    reviewComment: null,
    reviewedBy: null,
    reviewedAt: null,
    authVersion: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    version: 1,
  }
}

class TestIdentities extends IdentityService {
  current: Actor
  calls = 0

  constructor(status: User["status"] = "ACTIVE") {
    super()
    const person = user(status)
    this.current = actorFrom(
      {
        users: [person],
        orgs: [],
        roles: [],
        permissions: [],
        rolePermissions: [],
        userRoles: [],
        extras: [],
        managed: [],
      },
      person,
    )
  }

  override async actor(id: number) {
    this.calls += 1
    if (id !== this.current.user.id) throw AppError.unauthorized()
    return this.current
  }
}

function fixture(identities = new TestIdentities(), key = secret) {
  const application = new Elysia()
    .use(errorHandler)
    .use(createAuthentication(identities, key))
    .get("/public", () => ok(null))
    .get("/active", ({ actor }) => ok({ id: actor.user.id, roles: actor.profile.roles }), {
      auth: "active",
    })
    .get("/restricted", ({ actor }) => ok({ id: actor.user.id }), { auth: "restricted" })
    .get("/legacy", async ({ authenticate }) => ok((await authenticate()).user.id))
    .post("/validated", ({ actor, body }) => ok({ id: actor.user.id, ...body }), {
      auth: "active",
      body: t.Object({ count: t.Integer({ minimum: 1 }) }),
    })
    .group("/guarded", (group) =>
      group.guard({ auth: "active" }).get("/probe", ({ actor }) => ok(actor.user.id)),
    )
    .get("/outside", () => ok(null))
    .compile()

  return {
    identities,
    async request(path: string, token = "", body?: unknown) {
      return application.handle(
        new Request(`http://localhost${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      )
    },
  }
}

function token(claims = { sub: "1", authVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }) {
  return signer.decorator.signer.sign(claims)
}

describe("声明式认证与兼容接口", () => {
  test("启用账号注入最新actor，每个请求只查询一次身份", async () => {
    const { request, identities } = fixture()
    const credential = await token()
    let response = await request("/active", credential)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ code: 0, message: "ok", data: { id: 1, roles: [] } })
    identities.current.profile.roles = ["social"]
    response = await request("/active", credential)
    expect((await response.json()).data.roles).toEqual(["social"])
    expect(identities.calls).toBe(2)
  })

  test("未认证和损坏凭证返回统一错误，公开路由不访问身份", async () => {
    const { request, identities } = fixture()
    expect((await request("/public")).status).toBe(200)
    expect((await request("/active")).status).toBe(401)
    const response = await request("/active", "broken-token")
    expect(response.status).toBe(401)
    expect((await response.json()).code).toBe(2001)
    expect(identities.calls).toBe(0)
  })

  test("过期、非法账号标识及失效认证版本被拒绝", async () => {
    const { request } = fixture()
    for (const claims of [
      { sub: "1", authVersion: 1, exp: 1 },
      { sub: "invalid", authVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 },
      { sub: "1", authVersion: 0, exp: Math.floor(Date.now() / 1000) + 60 },
    ]) {
      const response = await request("/active", await token(claims))
      expect(response.status).toBe(401)
      expect((await response.json()).code).toBe(2001)
    }
  })

  test("待审核及驳回账号仅可访问受限白名单", async () => {
    for (const status of ["PENDING", "REJECTED"] as const) {
      const { request } = fixture(new TestIdentities(status))
      const credential = await token()
      expect((await request("/restricted", credential)).status).toBe(200)
      const response = await request("/active", credential)
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe(2003)
    }
  })

  test("停用、离职账号在所有认证模式下失效", async () => {
    for (const status of ["DISABLED", "LEFT"] as const) {
      const { request } = fixture(new TestIdentities(status))
      for (const path of ["/active", "/restricted"]) {
        const response = await request(path, await token())
        expect(response.status).toBe(401)
        expect((await response.json()).code).toBe(2001)
      }
    }
  })

  test("参数验证先于认证，不触发身份读取", async () => {
    const { request, identities } = fixture()
    const response = await request("/validated", await token(), { count: 0 })
    expect(response.status).toBe(422)
    expect((await response.json()).code).toBe(1000)
    expect(identities.calls).toBe(0)
  })

  test("guard认证只覆盖所在分组，兼容路由继续校验凭证", async () => {
    const { request, identities } = fixture()
    expect((await request("/guarded/probe")).status).toBe(401)
    expect((await request("/outside")).status).toBe(200)
    expect((await request("/legacy")).status).toBe(401)
    const credential = await token()
    expect((await request("/guarded/probe", credential)).status).toBe(200)
    expect((await request("/legacy", credential)).status).toBe(200)
    expect(identities.calls).toBe(2)
  })

  test("请求之间账号版本变化立即撤销旧凭证", async () => {
    const { request, identities } = fixture()
    const credential = await token()
    expect((await request("/active", credential)).status).toBe(200)
    identities.current.user.authVersion += 1
    const response = await request("/active", credential)
    expect(response.status).toBe(401)
    expect((await response.json()).code).toBe(2001)
  })

  test("未配置密钥拒绝认证，公开路由仍可访问", async () => {
    const { request, identities } = fixture(new TestIdentities(), "")
    expect((await request("/public")).status).toBe(200)
    const response = await request("/restricted", await token())
    expect(response.status).toBe(401)
    expect((await response.json()).message).toBe("请先配置后端认证密钥")
    expect(identities.calls).toBe(0)
  })
})
