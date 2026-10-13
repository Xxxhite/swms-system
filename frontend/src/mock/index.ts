import type { AxiosRequestConfig, AxiosResponse } from 'axios'

import { httpStatusOf } from '@/api/error-code'
import type { ApiResponse } from '@/api/types'
import { mockLogin, mockLogout, mockProfile } from '@/mock/auth'

type MockHandler = (config: AxiosRequestConfig) => ApiResponse<unknown>

/**
 * mock 路由表。key 是「方法 + 路径」，路径要和 src/api/modules 里写的请求地址一致。
 * 新增接口时在这里补一行；真实后端接上后，这个文件整体不再被引用。
 */
const routes: Record<string, MockHandler> = {
    'POST /auth/login': mockLogin,
    'GET /auth/profile': mockProfile,
    'POST /auth/logout': mockLogout,
}

/** 内存适配器：伪造 HTTP 响应，但不绕过 axios 的请求/响应拦截器 */
export async function mockAdapter(config: AxiosRequestConfig): Promise<AxiosResponse> {
    const method = (config.method ?? 'get').toUpperCase()
    const url = (config.url ?? '').split('?')[0]
    const key = `${method} ${url}`
    const handler = routes[key]

    // 模拟一点网络延迟，方便看出 loading 状态
    await new Promise((resolve) => setTimeout(resolve, 250))

    const body: ApiResponse<unknown> = handler
        ? handler(config)
        : { code: 3000, message: `mock 未实现的接口：${key}`, data: null }

    return {
        data: body,
        status: httpStatusOf(body.code),
        statusText: 'OK',
        headers: {},
        config: config as AxiosResponse['config'],
    }
}
