/**
 * 统一业务错误码。
 *
 * 约定：0 表示成功；错误码按段划分，HTTP 状态码由错误码推导（见 httpStatusOf），
 * 前端请求层结合业务 code 与 HTTP 状态识别失败，统一显示错误文案。
 */
export const ErrorCode = {
  OK: 0,

  /** 1000 ~ 1999：参数与请求格式 */
  PARAM_INVALID: 1000,

  /** 2000 ~ 2999：认证与授权 */
  UNAUTHORIZED: 2000,
  TOKEN_EXPIRED: 2001,
  FORBIDDEN: 2003,

  /** 3000 ~ 3999：资源 */
  NOT_FOUND: 3000,

  /** 4000 ~ 4999：业务规则冲突 */
  CONFLICT: 4000,

  /** 5000 及以上：服务端 */
  INTERNAL: 5000,
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]

/** 由业务错误码推导 HTTP 状态码 */
export function httpStatusOf(code: number): number {
  if (code >= ErrorCode.INTERNAL) return 500
  if (code >= ErrorCode.CONFLICT) return 409
  if (code >= ErrorCode.NOT_FOUND) return 404
  if (code >= ErrorCode.UNAUTHORIZED) {
    return code === ErrorCode.FORBIDDEN ? 403 : 401
  }
  if (code >= ErrorCode.PARAM_INVALID) return 400
  return 200
}

/**
 * 业务异常。业务代码里直接 throw AppError.xxx(...)，
 * 由 plugins/error-handler.ts 统一转成响应体，不需要在每个 handler 里 try/catch。
 */
export class AppError extends Error {
  readonly code: number
  readonly httpStatus: number

  constructor(code: number, message: string, httpStatus?: number) {
    super(message)
    this.name = "AppError"
    this.code = code
    this.httpStatus = httpStatus ?? httpStatusOf(code)
  }

  /** 创建参数或请求格式错误，默认映射为 HTTP 400。 */
  static badRequest(message = "请求参数不合法"): AppError {
    return new AppError(ErrorCode.PARAM_INVALID, message)
  }

  /** 创建未登录错误，提示客户端先完成认证。 */
  static unauthorized(message = "请先登录"): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message)
  }

  /** 创建凭证失效错误，供客户端清理会话并重新登录。 */
  static tokenExpired(message = "登录状态已过期，请重新登录"): AppError {
    return new AppError(ErrorCode.TOKEN_EXPIRED, message)
  }

  /** 创建已无操作权限的错误，默认映射为 HTTP 403。 */
  static forbidden(message = "没有权限执行该操作"): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message)
  }

  /** 创建业务资源不存在的错误，默认映射为 HTTP 404。 */
  static notFound(message = "数据不存在"): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message)
  }

  /** 创建版本、唯一性或状态冲突错误，默认映射为 HTTP 409。 */
  static conflict(message = "数据状态冲突，请刷新后重试"): AppError {
    return new AppError(ErrorCode.CONFLICT, message)
  }
}
