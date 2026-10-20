import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

import { filterMenuTree, LAYOUT_NAME, menuToRoutes, menuTree, publicRoutes } from '@/router/routes'

/**
 * 路由表分两部分：
 * - 免登录路由（登录页、测试页）在这里静态注册
 * - 业务路由由登录后的权限动态装配（见 installLayout）
 */
const APP_TITLE = '温馨社工服务信息管理系统'

const router = createRouter({
    history: createWebHashHistory(),
    routes: [...publicRoutes],
})

router.afterEach((to) => {
    if (typeof document === 'undefined') return
    document.title = to.meta.title ? `${to.meta.title} - ${APP_TITLE}` : APP_TITLE
})

/**
 * 按当前用户的权限装配布局路由与业务路由。
 * 安装前移除旧布局及其子路由，防止切换账号后残留上一账号的访问入口。
 */
export function installLayout(permissions: string[]): void {
    if (router.hasRoute(LAYOUT_NAME)) router.removeRoute(LAYOUT_NAME)

    const menus = filterMenuTree(menuTree, permissions)
    const children: RouteRecordRaw[] = [
        {
            path: 'dashboard',
            name: 'Dashboard',
            component: () => import('@/views/dashboard/index.vue'),
            meta: { title: '工作台' },
        },
        ...menuToRoutes(menus),
        {
            path: 'profile',
            name: 'Profile',
            component: () => import('@/views/profile/index.vue'),
            meta: { title: '个人中心' },
        },
        {
            // 未知地址与当前账号未注册的业务地址共用兜底页。
            path: ':pathMatch(.*)*',
            name: 'NotFound',
            component: () => import('@/views/error/NotFound.vue'),
            meta: { title: '页面不存在或暂不可访问' },
        },
    ]

    router.addRoute({
        path: '/',
        name: LAYOUT_NAME,
        component: () => import('@/layouts/BasicLayout.vue'),
        redirect: '/dashboard',
        children,
    })
}

/** 退出登录时清掉动态路由 */
export function clearLayout(): void {
    if (router.hasRoute(LAYOUT_NAME)) router.removeRoute(LAYOUT_NAME)
}

export default router
