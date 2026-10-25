import { createFileRoutes } from "./file/file.route"
import { createProjectRoutes } from "./project/project.route"
import { createServiceRoutes } from "./service/service.route"
import { createApprovalRoutes } from "./approval/approval.route"
import { createAnalysisRoutes } from "./analysis/analysis.route"
import type { AnyElysia } from "elysia"
import { createAuthRoutes } from "./auth/auth.route"
import { createIdentityRoutes } from "./identity/identity.route"
import { createSystemRoutes } from "./system/system.route"

/**
 * 业务模块注册入口，由 app.ts 统一挂载。
 *
 * 模块约定（每个模块一个目录，导出三个文件）：
 * - xxx.route.ts        Elysia 实例，只做路由声明和参数校验，prefix 由模块自带
 * - xxx.service.ts      业务编排，写业务规则、状态流转、审批链路
 * - xxx.repository.ts   数据库读写，只有这里可以直接用 @/db 的 db 实例
 *
 * 所有模块统一挂在 /api 下，例如 service 模块声明 prefix "/service"，
 * 最终路径就是 /api/service/...。
 *
 * 仅注册已实现的模块；待业务需求与表结构确认后再接入模块骨架。
 */
export const modules: AnyElysia[] = [
  createAuthRoutes(),
  createIdentityRoutes(),
  createSystemRoutes(),
  createProjectRoutes(),
  createProjectRoutes(undefined, undefined, "/service/contract-package-projects"),
  createServiceRoutes(),
  createServiceRoutes(undefined, undefined, "records"),
  createApprovalRoutes(),
  createAnalysisRoutes(),
  createFileRoutes(),
]
