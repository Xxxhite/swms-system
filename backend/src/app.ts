import { cors } from "@elysiajs/cors"
import { swagger } from "@elysiajs/swagger"
import { Elysia } from "elysia"

import { modules } from "@/modules"
import { errorHandler } from "@/plugins/error-handler"
import { env } from "@/utils/env"
import { ok } from "@/utils/response"

/**
 * 装配公共插件、健康检查与业务模块；端口监听由 index.ts 负责。
 * 导出的应用可通过 app.handle(request) 直接验证请求处理链路。
 */
export const app = new Elysia()
  .use(errorHandler)
  .use(
    cors({
      // 使用 Bearer 请求头认证，显式关闭 Cookie 等跨域凭证支持。
      credentials: false,
      origin: env.corsOrigins,
    }),
  )
  .use(
    swagger({
      path: "/docs",
      documentation: {
        info: {
          title: "温馨社工服务信息管理系统 API",
          version: "0.1.0",
          description:
            "温馨社工服务信息管理系统接口。响应体统一为 { code, message, data }，code 为 0 表示成功。",
        },
        tags: [
          { name: "基本信息", description: "登录、人员、角色权限" },
          { name: "服务管理", description: "合同包项目立项、指标设置与监测、服务档案" },
          { name: "项目管理", description: "总部项目立项到结项" },
          { name: "活动管理", description: "指标外活动" },
          { name: "资源管理", description: "利益相关方与合作情况" },
          { name: "数据分析", description: "多维分析与报表" },
          { name: "知识管理", description: "文书模板、方案库、制度库、课件" },
          { name: "系统管理", description: "机构、架构、用户、权限、备份" },
        ],
      },
    }),
  )
  .get("/health", () =>
    ok({
      status: "up",
      env: env.nodeEnv,
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    }),
  )
  // 业务模块统一挂在 /api 下，模块路由自带二级 prefix
  .group("/api", (api) => api.use(modules))
