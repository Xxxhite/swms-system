import axios, { type AxiosAdapter, type AxiosInstance, type AxiosRequestConfig } from 'axios'

import { ErrorCode } from '@/api/error-code'
import type { ApiResponse } from '@/api/types'

interface ClientOptions {
    baseURL: string
    adapter?: AxiosAdapter
    getToken: () => string
    onUnauthorized: () => void
    onError: (message: string) => void
}

/** 识别后端响应信封；HTTP 状态和 mock 状态均走同一套业务错误处理。 */
function isApiResponse(value: unknown): value is ApiResponse<unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'code' in value &&
        typeof value.code === 'number' &&
        'message' in value &&
        typeof value.message === 'string' &&
        'data' in value
    )
}

/** 请求层只负责传输和响应契约，登录状态及提示由应用入口注入。 */
export function createApiClient(options: ClientOptions): AxiosInstance {
    const instance = axios.create({
        baseURL: options.baseURL,
        timeout: 15000,
        ...(options.adapter ? { adapter: options.adapter } : {}),
    })
    // 会话清理后抑制后续重复的未授权处理与提示。
    let unauthorizedHandled = false

    /** 统一报告请求错误；同一轮并发凭证失效只触发一次会话清理和提示。 */
    function report(message: string, unauthorized = false): void {
        if (unauthorized) {
            if (unauthorizedHandled) return
            unauthorizedHandled = true
            options.onUnauthorized()
        }
        options.onError(message)
    }

    instance.interceptors.request.use((config) => {
        const token = options.getToken()
        if (token) {
            // 带凭证的新请求重新启用未授权处理，以覆盖再次登录后的会话失效。
            unauthorizedHandled = false
            config.headers.Authorization = `Bearer ${token}`
        }
        return config
    })

    instance.interceptors.response.use(
        async (response) => {
            if (response.config.responseType === 'blob' && response.data instanceof Blob) {
                if (
                    [
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'application/pdf',
                        'image/png',
                        'image/jpeg',
                        'application/msword',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    ].some(
                        (type) =>
                            String(response.headers['content-type'] ?? '').split(';')[0] === type,
                    )
                )
                    return response
                try {
                    response.data = JSON.parse(await response.data.text())
                } catch {
                    /* 交给统一格式校验 */
                }
            }
            const body: unknown = response.data
            if (!isApiResponse(body)) {
                const message = '接口响应格式不正确'
                report(message)
                return Promise.reject(new Error(message))
            }
            // mock 适配器也可能将业务失败送入成功分支，因此仍需检查业务码。
            if (body.code !== ErrorCode.OK) {
                const message = body.message || '请求失败'
                report(
                    message,
                    body.code === ErrorCode.UNAUTHORIZED || body.code === ErrorCode.TOKEN_EXPIRED,
                )
                return Promise.reject(new Error(message))
            }
            if (response.config.responseType === 'blob') {
                const message = '下载未返回有效的 Excel 文件'
                report(message)
                return Promise.reject(new Error(message))
            }
            return response
        },
        async (error: unknown) => {
            if (!axios.isAxiosError(error)) {
                report('请求失败')
                return Promise.reject(error)
            }
            if (error.response?.data instanceof Blob) {
                try {
                    error.response.data = JSON.parse(await error.response.data.text())
                } catch {
                    /* 保留 HTTP 错误提示 */
                }
            }
            const body: unknown = error.response?.data
            const status = error.response?.status
            if (isApiResponse(body) && body.code !== ErrorCode.OK) {
                report(
                    body.message || '请求失败',
                    status === 401 ||
                        body.code === ErrorCode.UNAUTHORIZED ||
                        body.code === ErrorCode.TOKEN_EXPIRED,
                )
            } else if (status === 401) {
                report('登录状态已失效，请重新登录', true)
            } else if (status === 403) {
                report('没有权限执行该操作')
            } else if (status !== undefined) {
                report(`请求失败（HTTP ${status}）`)
            } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                report('请求超时，请稍后重试')
            } else if (!axios.isCancel(error)) {
                report('网络异常，请确认后端服务已启动')
            }
            return Promise.reject(error)
        },
    )
    return instance
}

/** 从已通过响应拦截器校验的响应中提取业务数据。 */
export function createHttp(instance: AxiosInstance) {
    /** 从已通过响应拦截器校验的响应中提取 data，保留调用方的业务类型。 */
    async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
        return (await promise).data.data as T
    }
    return {
        /** 下载受控 Excel，成功才返回文件，JSON 错误交给响应拦截器。 */
        async download(url: string, params?: Record<string, unknown>): Promise<Blob> {
            return (await instance.get<Blob>(url, { params, responseType: 'blob' })).data
        },
        /** 发送带查询参数的 GET 请求并返回业务数据。 */
        get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
            return unwrap<T>(instance.get<ApiResponse<T>>(url, { params }))
        },
        /** 发送 POST 请求，允许按需传入额外 Axios 配置。 */
        post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
            return unwrap<T>(instance.post<ApiResponse<T>>(url, data, config))
        },
        /** 发送 PUT 请求，提交业务更新数据。 */
        put<T>(url: string, data?: unknown): Promise<T> {
            return unwrap<T>(instance.put<ApiResponse<T>>(url, data))
        },
        /** 发送 DELETE 请求，将版本等校验参数放入查询字符串。 */
        delete<T>(url: string, params?: Record<string, unknown>): Promise<T> {
            return unwrap<T>(instance.delete<ApiResponse<T>>(url, { params }))
        },
    }
}
