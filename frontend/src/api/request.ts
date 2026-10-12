import axios, {type AxiosRequestConfig, type InternalAxiosRequestConfig} from 'axios'
import {ElMessage} from 'element-plus'
import 'element-plus/es/components/message/style/css'

import {apiBaseUrl, useMock} from '@/api/config'
import {ErrorCode} from '@/api/error-code'
import type {ApiResponse} from '@/api/types'
import {mockAdapter} from '@/mock'
import {getToken, removeToken} from '@/utils/auth'

const instance = axios.create({
    baseURL: apiBaseUrl,
    timeout: 15000,
    // mock 模式下换成内存适配器：走的是同一套拦截器，接口一换就切到真后端
    ...(useMock ? {adapter: mockAdapter} : {}),
})

instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    // 登录凭证走请求头，浏览器不会自动携带，所以天然不吃 CSRF
    const token = getToken()
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

/** 登录失效时统一处理；用 location 跳转，避免拦截器反向依赖 router 造成循环引用 */
let redirecting = false

function backToLogin(message: string): void {
    removeToken()
    if (redirecting) return
    redirecting = true
    ElMessage.error(message)
    const current = window.location.hash.replace(/^#/, '') || '/'
    window.location.hash = `#/login?redirect=${encodeURIComponent(current)}`
    window.setTimeout(() => {
        redirecting = false
    }, 1000)
}

instance.interceptors.response.use(
    (response) => {
        const body = response.data as ApiResponse<unknown> | undefined
        // 后端约定 code=0 为成功，HTTP 状态码只作辅助
        if (body && typeof body.code === 'number' && body.code !== ErrorCode.OK) {
            const message = body.message || '请求失败'
            if (body.code === ErrorCode.UNAUTHORIZED || body.code === ErrorCode.TOKEN_EXPIRED) {
                backToLogin(message)
            } else {
                ElMessage.error(message)
            }
            return Promise.reject(new Error(message))
        }
        return response
    },
    (error) => {
        const status: number | undefined = error?.response?.status
        if (status === 401) {
            backToLogin('登录状态已失效，请重新登录')
        } else if (status === 403) {
            ElMessage.error('没有权限执行该操作')
        } else if (error?.code === 'ECONNABORTED') {
            ElMessage.error('请求超时，请稍后重试')
        } else {
            ElMessage.error('网络异常，请确认后端服务已启动')
        }
        return Promise.reject(error)
    },
)

/** 拆掉响应信封，调用方直接拿 data */
async function unwrap<T>(promise: Promise<{data: ApiResponse<T>}>): Promise<T> {
    const response = await promise
    return response.data.data as T
}

export const http = {
    get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
        return unwrap<T>(instance.get<ApiResponse<T>>(url, {params}))
    },
    post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
        return unwrap<T>(instance.post<ApiResponse<T>>(url, data, config))
    },
    put<T>(url: string, data?: unknown): Promise<T> {
        return unwrap<T>(instance.put<ApiResponse<T>>(url, data))
    },
    delete<T>(url: string, params?: Record<string, unknown>): Promise<T> {
        return unwrap<T>(instance.delete<ApiResponse<T>>(url, {params}))
    },
}

export default instance
