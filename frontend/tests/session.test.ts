import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { CurrentUser } from '../src/api/types'
import { createApiClient } from '../src/api/client'

const user: CurrentUser = {
    id: 1,
    username: 'admin',
    name: '测试用户',
    roles: ['ADMIN'],
    roleNames: ['管理员'],
    teamId: null,
    teamName: '总部',
    dataScope: 'ALL',
    permissions: ['system:view'],
}
const login = mock(async () => ({ token: 'test-token', user }))
const profile = mock(async (): Promise<CurrentUser> => user)
const logout = mock(async () => null)
const clearLayout = mock(() => {})
const installLayout = mock(() => {})

mock.module('@/api/modules/auth', () => ({ authApi: { login, profile, logout } }))
mock.module('@/router', () => ({
    default: createRouter({ history: createMemoryHistory(), routes: [] }),
    clearLayout,
    installLayout,
}))

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    },
})

const { useUserStore } = await import('../src/stores/user')
const { setupRouterGuard } = await import('../src/router/guard')

beforeEach(() => {
    storage.clear()
    setActivePinia(createPinia())
    login.mockClear()
    profile.mockReset().mockResolvedValue(user)
    logout.mockReset().mockResolvedValue(null)
    clearLayout.mockClear()
    installLayout.mockClear()
})

afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('登录状态与路由守卫', () => {
    test('认证错误同步清理存储、用户资料、菜单和动态路由', async () => {
        const store = useUserStore()
        await store.login({ username: 'admin', password: 'test' })
        expect(store.loaded).toBe(true)
        expect(store.menus.length).toBeGreaterThan(0)

        const client = createApiClient({
            baseURL: '/api',
            getToken: () => store.token,
            onUnauthorized: store.resetSession,
            onError: () => {},
            adapter: async (config) => ({
                config,
                status: 401,
                statusText: '',
                headers: {},
                data: { code: 2001, message: '登录已过期', data: null },
            }),
        })
        await expect(client.get('/profile')).rejects.toThrow()
        expect(storage.has('swms_token')).toBe(false)
        expect(store.token).toBe('')
        expect(store.profile).toBeNull()
        expect(store.loaded).toBe(false)
        expect(store.permissions).toEqual([])
        expect(store.menus).toEqual([])
        expect(clearLayout).toHaveBeenCalledTimes(1)
    })

    test('登出接口失败也会清理本地会话', async () => {
        const store = useUserStore()
        await store.login({ username: 'admin', password: 'test' })
        logout.mockRejectedValueOnce(new Error('offline'))
        await expect(store.logout()).rejects.toThrow('offline')
        expect(store.token).toBe('')
        expect(store.profile).toBeNull()
        expect(storage.has('swms_token')).toBe(false)
        expect(clearLayout).toHaveBeenCalledTimes(1)
    })

    test('恢复资料失败后停留在登录页，保留目标地址并允许重试', async () => {
        storage.set('swms_token', 'stale-token')
        profile.mockRejectedValueOnce(new Error('expired'))
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/login', component: {}, meta: { public: true } },
                { path: '/dashboard', component: {} },
                { path: '/private', component: {} },
            ],
        })
        setupRouterGuard(router)
        await router.push('/private?tab=one')
        expect(router.currentRoute.value.path).toBe('/login')
        expect(router.currentRoute.value.query.redirect).toBe('/private?tab=one')
        expect(useUserStore().token).toBe('')
        expect(profile).toHaveBeenCalledTimes(1)
        await router.push('/login')
        expect(router.currentRoute.value.path).toBe('/login')
    })

    test('退出后的旧资料请求不能重新恢复登录', async () => {
        const store = useUserStore()
        await store.login({ username: 'admin', password: 'test' })
        let resolveProfile!: (value: CurrentUser) => void
        profile.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveProfile = resolve
                }),
        )
        const pending = store.loadProfile()
        store.resetSession()
        resolveProfile(user)
        await expect(pending).rejects.toThrow('登录状态已变更')
        expect(store.loaded).toBe(false)
        expect(store.profile).toBeNull()
        expect(installLayout).toHaveBeenCalledTimes(1)
    })
})
