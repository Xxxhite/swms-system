import { ErrorCode } from "./errors"

/** 统一响应体：前端拦截器按 code 判断成败，data 承载业务数据 */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
}

/** 构造成功响应，业务数据统一放入 data。 */
export function ok<T>(data: T, message = "ok"): ApiResponse<T> {
  return { code: ErrorCode.OK, message, data }
}

/** 构造失败响应，保留业务错误码与可展示文案。 */
export function fail(code: number, message: string, data: unknown = null): ApiResponse<unknown> {
  return { code, message, data }
}

/** 分页响应体的统一形状，列表接口都用它包一层 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/** 将列表、总数和分页参数封装成统一成功响应。 */
export function page<T>(
  list: T[],
  total: number,
  pageNo: number,
  pageSize: number,
): ApiResponse<PageResult<T>> {
  return ok({ list, total, page: pageNo, pageSize })
}
