import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'

import { createApiClient, createHttp } from '@/api/client'
import { apiBaseUrl, useMock } from '@/api/config'
import { mockAdapter } from '@/mock'
import { getToken, removeToken } from '@/utils/auth'

let unauthorizedHandler: (() => void) | undefined

/** 在应用入口注入状态清理与导航，避免请求层反向依赖 store/router。 */
export function setupRequestAuth(handler: () => void): void {
    unauthorizedHandler = handler
}

const instance = createApiClient({
    baseURL: apiBaseUrl,
    ...(useMock ? { adapter: mockAdapter } : {}),
    getToken,
    onUnauthorized: () => {
        removeToken()
        unauthorizedHandler?.()
    },
    onError: (message) => {
        ElMessage.error(message)
    },
})

export const http = createHttp(instance)
export default instance
