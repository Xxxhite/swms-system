import type { AxiosAdapter } from 'axios'
import { createApiClient, createHttp } from './client'
/** 公开确认使用独立客户端，凭证失效不改变工作人员会话。 */
export function createParticipationClient(
    baseURL: string,
    onError: (message: string) => void,
    adapter?: AxiosAdapter,
) {
    return createHttp(
        createApiClient({
            baseURL,
            onError,
            getToken: () => '',
            onUnauthorized: () => {},
            ...(adapter ? { adapter } : {}),
        }),
    )
}
