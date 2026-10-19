import router from '@/router'
import type { Router } from 'vue-router'
import { useUserStore } from '@/stores/user'

/**
 * 全局路由守卫：
 * - 免登录页面直接放行（已登录时访问登录页则回工作台）
 * - 没有 token 一律回登录页，并记住原目标地址
 * - 有 token 但用户资料还没加载（例如刷新页面），先拉一次资料并装配动态路由，再重新导航
 */
export function setupRouterGuard(targetRouter: Router = router): void {
    targetRouter.beforeEach(async (to) => {
        const userStore = useUserStore()

        if (to.meta.public) {
            if (to.path === '/login' && userStore.token) {
                return { path: '/dashboard', replace: true }
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
            // 动态路由已安装，重新匹配目标地址并替换本次导航记录。
            return { ...to, replace: true }
        }

        return true
    })
}
