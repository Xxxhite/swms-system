/**
 * 登录凭证的本地存取。
 * 当前方案：JWT 放请求头（Authorization: Bearer xxx），所以存在 localStorage 里，
 * 由 src/api/request.ts 的请求拦截器统一附加。
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
