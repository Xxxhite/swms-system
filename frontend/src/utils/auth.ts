/**
 * 登录凭证的本地存取。
 * token 存储在 localStorage，用于刷新页面后恢复会话。
 * src/api/client.ts 的请求拦截器读取 token，并附加 Authorization: Bearer 请求头。
 */
const TOKEN_KEY = 'swms_token'

/** 读取本地登录凭证，无记录时返回空字符串。 */
export function getToken(): string {
    return localStorage.getItem(TOKEN_KEY) ?? ''
}

/** 保存登录凭证，供后续请求及刷新恢复使用。 */
export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token)
}

/** 移除本地凭证；用户资料与动态路由另由 store 清理。 */
export function removeToken(): void {
    localStorage.removeItem(TOKEN_KEY)
}
