/**
 * 业务错误码，与后端 backend/src/utils/errors.ts 一一对应。
 * 改这里的时候记得同步改后端，否则前端拦截器的判断会失准。
 */
export const ErrorCode = {
    OK: 0,
    PARAM_INVALID: 1000,
    UNAUTHORIZED: 2000,
    TOKEN_EXPIRED: 2001,
    FORBIDDEN: 2003,
    NOT_FOUND: 3000,
    CONFLICT: 4000,
    INTERNAL: 5000,
} as const

/** 由业务错误码推导 HTTP 状态码，规则和后端保持一致 */
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
