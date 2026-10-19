/**
 * 登录凭证的本地存取。
 * token 存储在 localStorage，用于刷新页面后恢复会话。
 * src/api/client.ts 的请求拦截器读取 token，并附加 Authorization: Bearer 请求头。
 */
const TOKEN_KEY = 'swms_token'

export function getToken(): string {
    return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token)
}

export function removeToken(): void {
    localStorage.removeItem(TOKEN_KEY)
}
