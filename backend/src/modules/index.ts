import type { Elysia } from "elysia"

/**
 * 业务模块注册表。新增模块时只改这一个文件，app.ts 不用动。
 *
 * 模块约定（每个模块一个目录，导出三个文件）：
 * - xxx.route.ts        Elysia 实例，只做路由声明和参数校验，prefix 由模块自带
 * - xxx.service.ts      业务编排，写业务规则、状态流转、审批链路
 * - xxx.repository.ts   数据库读写，只有这里可以直接用 @/db 的 db 实例
 *
 * 所有模块统一挂在 /api 下，例如 service 模块声明 prefix "/service"，
 * 最终路径就是 /api/service/...。
 *
 * 当前为空：业务模块的表结构要等机构调研结果，模块骨架先不挂假路由。
 */
export const modules: Elysia[] = []
