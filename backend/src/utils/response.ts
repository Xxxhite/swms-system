import { ErrorCode } from "./errors"

/** 统一响应体：前端拦截器按 code 判断成败，data 承载业务数据 */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
}

export function ok<T>(data: T, message = "ok"): ApiResponse<T> {
  return { code: ErrorCode.OK, message, data }
}

export function fail(
  code: number,
  message: string,
  data: unknown = null,
): ApiResponse<unknown> {
  return { code, message, data }
}

/** 分页响应体的统一形状，列表接口都用它包一层 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export function page<T>(
  list: T[],
  total: number,
  pageNo: number,
  pageSize: number,
): ApiResponse<PageResult<T>> {
  return ok({ list, total, page: pageNo, pageSize })
}
