import router from '@/router'
import type { Router } from 'vue-router'
import { useUserStore } from '@/stores/user'

/**
 * 全局路由守卫：
 * - 免登录页面直接放行；已有登录态访问登录或注册页时，按账号状态回工作台或审核页
 * - 没有 token 一律回登录页，并记住原目标地址
 * - 有 token 但用户资料还没加载（例如刷新页面），先拉一次资料并装配动态路由，再重新导航
 * - 待审核和被驳回账号统一进入审核状态页，已启用账号不再停留于该页
 */
export function setupRouterGuard(targetRouter: Router = router): void {
    targetRouter.beforeEach(async (to) => {
        const userStore = useUserStore()

        if (to.meta.public) {
            if (['/login', '/register'].includes(to.path) && userStore.token) {
                try {
                    if (!userStore.loaded) await userStore.loadProfile()
                } catch {
                    userStore.resetSession()
                    return true
                }
                return { path: userStore.homePath, replace: true }
            }
            return true
        }

        if (!userStore.token) {
            return { path: '/login', query: { redirect: to.fullPath }, replace: true }
        }

        if (!userStore.loaded) {
            try {
                await userStore.loadProfile()
            } catch {
                // 资料恢复失败时清理会话并保留目标地址，接口错误提示由请求层负责。
                userStore.resetSession()
                return { path: '/login', query: { redirect: to.fullPath }, replace: true }
            }
            // 首次匹配可能落在 404；资料恢复后按新路由表重新匹配，受限账号改去审核页。
            return { path: userStore.restricted ? '/account-status' : to.fullPath, replace: true }
        }

        // 深链接或手工输入业务地址也经过此分流，避免受限账号进入主布局。
        if (userStore.restricted && to.path !== '/account-status')
            return { path: '/account-status', replace: true }
        if (!userStore.restricted && to.path === '/account-status')
            return { path: '/dashboard', replace: true }

        return true
    })
}
