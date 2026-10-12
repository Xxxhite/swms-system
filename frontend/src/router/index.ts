import {createRouter, createWebHashHistory, type RouteRecordRaw} from 'vue-router'

import {filterMenuTree, LAYOUT_NAME, menuToRoutes, menuTree, publicRoutes} from '@/router/routes'

/**
 * 路由表分两部分：
 * - 免登录路由（登录页、脚手架验证页）在这里静态注册
 * - 业务路由由登录后的权限动态装配（见 installLayout）
 */
const router = createRouter({
    history: createWebHashHistory(),
    routes: [...publicRoutes],
})

/**
 * 按当前用户的权限装配布局路由与业务路由。
 * 每次重新登录都先移除旧的再挂新的，避免上一轮的菜单残留。
 */
export function installLayout(permissions: string[]): void {
    if (router.hasRoute(LAYOUT_NAME)) router.removeRoute(LAYOUT_NAME)

    const menus = filterMenuTree(menuTree, permissions)
    const children: RouteRecordRaw[] = [
        {
            path: 'dashboard',
            name: 'Dashboard',
            component: () => import('@/views/dashboard/index.vue'),
            meta: {title: '工作台'},
        },
        ...menuToRoutes(menus),
        {
            // 兜底路由必须最后注册，否则会把上面这些业务路由全吃掉
            path: ':pathMatch(.*)*',
            name: 'NotFound',
            component: () => import('@/views/placeholder/ModulePlaceholder.vue'),
            meta: {title: '页面不存在'},
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
