import { describe, expect, spyOn, test } from "bun:test"
import { Elysia, t } from "elysia"

import { app } from "@/app"
import { errorHandler } from "@/plugins/error-handler"
import { AppError } from "@/utils/errors"
import { ok } from "@/utils/response"

const fixture = new Elysia()
  .use(errorHandler)
  .get("/forbidden", () => {
    throw AppError.forbidden("无权访问此团队")
  })
  .get("/unexpected", () => {
    throw new Error("private server detail")
  })
  .post("/validated", ({ body }) => ok(body), {
    body: t.Object({ count: t.Integer({ minimum: 1 }) }),
  })
  .compile()

describe("应用基础契约", () => {
  test("注册无效输入返回字段提示，不进入数据库写入", async () => {
    const valid = {
      username: "validation_probe",
      password: "Validation_2026",
      name: "测试社工",
      phone: "13800000000",
      arrivalDate: "2026-10-21",
      major: "社会工作",
      proposedPosition: "社工",
      education: "本科",
      politicalStatus: "群众",
    }
    const cases = [
      [{ password: "123456" }, "密码须为 8—128 字符"],
      [{ password: "a".repeat(129) }, "密码须为 8—128 字符"],
      [{ username: "Bad!" }, "账号为 3—32 位小写字母、数字或下划线"],
      [{ name: "   " }, "姓名须为 1—50 字符且不能全为空格"],
      [{ phone: "" }, "联系电话须为 1—32 字符且不能全为空格"],
      [{ major: "a".repeat(101) }, "专业须为 1—100 字符且不能全为空格"],
      [{ arrivalDate: "2026-02-30" }, "请选择有效的到岗日期"],
      [{ arrivalDate: "2026-02-29" }, "请选择有效的到岗日期"],
      [{ arrivalDate: "2026-13-01" }, "请选择有效的到岗日期"],
    ] as const
    for (const [change, message] of cases) {
      const response = await app.handle(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...valid, ...change }),
        }),
      )
      expect([400, 422]).toContain(response.status)
      expect(await response.json()).toEqual({ code: 1000, message, data: null })
    }
  })
  test("健康检查使用统一成功响应", async () => {
    const response = await app.handle(new Request("http://localhost/health"))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.code).toBe(0)
    expect(body.data.status).toBe("up")
  })

  test("未注册接口返回资源错误", async () => {
    const response = await app.handle(new Request("http://localhost/api/missing"))
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 3000, data: null })
  })

  test("Swagger 页面可访问", async () => {
    const response = await app.handle(new Request("http://localhost/docs"))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
  })

  test("业务异常保留状态与文案", async () => {
    const response = await fixture.handle(new Request("http://localhost/forbidden"))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ code: 2003, message: "无权访问此团队", data: null })
  })

  test("参数校验失败返回统一错误体", async () => {
    const response = await fixture.handle(
      new Request("http://localhost/validated", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: 0 }),
      }),
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 1000, data: null })
  })

  test("未知异常不会向客户端泄露内部细节", async () => {
    const logger = spyOn(console, "error").mockImplementation(() => {})
    try {
      const response = await fixture.handle(new Request("http://localhost/unexpected"))
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ code: 5000, message: "服务器内部错误", data: null })
      expect(logger).toHaveBeenCalled()
    } finally {
      logger.mockRestore()
    }
  })

  test("带前缀的业务模块能挂载到 /api 下", async () => {
    const module = new Elysia({ prefix: "/example" }).get("/item", () => ok({ id: 1 }))
    const modularApp = new Elysia().group("/api", (api) => api.use([module])).compile()
    const response = await modularApp.handle(new Request("http://localhost/api/example/item"))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ code: 0, data: { id: 1 } })
  })
})
