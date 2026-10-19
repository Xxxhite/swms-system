import { Elysia } from "elysia"

import { AppError, ErrorCode } from "@/utils/errors"
import { fail } from "@/utils/response"

/**
 * 全局错误处理。先于业务模块挂载，通过 global 作用域统一处理路由异常。
 *
 * 分流规则：
 * - AppError          → 业务异常，用自带的错误码和 HTTP 状态
 * - VALIDATION        → Elysia 参数校验失败，1000 / 422
 * - NOT_FOUND         → 路由不存在，3000 / 404
 * - PARSE             → 请求体解析失败，1000 / 400
 * - 其他未知异常      → 记日志，5000 / 500（不把原始错误抛给客户端）
 */
export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  { as: "global" },
  ({ code, error, path, set }) => {
    if (error instanceof AppError) {
      set.status = error.httpStatus
      return fail(error.code, error.message)
    }

    switch (code) {
      case "VALIDATION": {
        set.status = 422
        return fail(ErrorCode.PARAM_INVALID, error.message)
      }
      case "NOT_FOUND": {
        set.status = 404
        return fail(ErrorCode.NOT_FOUND, `接口不存在：${path}`)
      }
      case "PARSE": {
        set.status = 400
        return fail(ErrorCode.PARAM_INVALID, "请求体解析失败")
      }
      default: {
        console.error(`[error] ${path}`, error)
        set.status = 500
        return fail(ErrorCode.INTERNAL, "服务器内部错误")
      }
    }
  },
)
