import type { RouteRecordRaw } from 'vue-router'

import { PERM } from '@/api/permissions'

/** 菜单节点：既是侧边菜单的数据源，也是动态路由的来源 */
export interface MenuNode {
    path: string
    title: string
    /** 功能权限码；不填表示任何登录用户都能看到 */
    permission?: string
    children?: MenuNode[]
}

/**
 * 业务菜单树，统一提供侧栏、工作台快捷入口及动态路由的数据源。
 * 菜单对应的页面组件由 menuToRoutes 指定。
 */
export const menuTree: MenuNode[] = [
    {
        path: '/service',
        title: '服务管理',
        children: [
            { path: '/service/monitor', title: '指标监测端', permission: PERM.SERVICE_MONITOR },
            {
                path: '/service/archive',
                title: '服务档案',
                permission: PERM.SERVICE_ARCHIVE,
                children: [
                    {
                        path: '/service/archive/case',
                        title: '专-个案',
                        permission: PERM.SERVICE_ARCHIVE,
                    },
                    {
                        path: '/service/archive/group',
                        title: '专-小组',
                        permission: PERM.SERVICE_ARCHIVE,
                    },
                    {
                        path: '/service/archive/activity',
                        title: '专-活动',
                        permission: PERM.SERVICE_ARCHIVE,
                    },
                    {
                        path: '/service/archive/volunteer',
                        title: '专-志愿者活动',
                        permission: PERM.SERVICE_ARCHIVE,
                    },
                    {
                        path: '/service/archive/record',
                        title: '专-建档',
                        permission: PERM.SERVICE_ARCHIVE,
                    },
                    {
                        path: '/service/archive/visit',
                        title: '专-探访',
                        permission: PERM.SERVICE_ARCHIVE,
                    },
                    {
                        path: '/service/archive/consult',
                        title: '专-咨询',
                        permission: PERM.SERVICE_ARCHIVE,
                    },
                    {
                        path: '/service/archive/meeting',
                        title: '行-会议记录',
                        permission: PERM.SERVICE_ARCHIVE,
                    },
                    {
                        path: '/service/archive/monthly',
                        title: '行-月计划',
                        permission: PERM.SERVICE_ARCHIVE,
                    },
                ],
            },
            { path: '/service/approval', title: '档案审批', permission: PERM.SERVICE_APPROVE },
        ],
    },
    { path: '/project', title: '项目管理', permission: PERM.PROJECT },
    { path: '/activity', title: '活动管理', permission: PERM.ACTIVITY },
    { path: '/resource', title: '资源管理', permission: PERM.RESOURCE },
    { path: '/analysis', title: '数据分析', permission: PERM.ANALYSIS },
    { path: '/knowledge', title: '知识管理', permission: PERM.KNOWLEDGE },
    { path: '/system', title: '系统管理', permission: PERM.SYSTEM },
]

/** 按权限递归过滤菜单并创建节点副本；无可见子节点的分组一并移除 */
export function filterMenuTree(nodes: MenuNode[], permissions: string[]): MenuNode[] {
    const result: MenuNode[] = []
    for (const node of nodes) {
        if (node.permission && !permissions.includes(node.permission)) continue

        if (node.children?.length) {
            const children = filterMenuTree(node.children, permissions)
            if (!children.length) continue
            result.push({ ...node, children })
        } else {
            result.push({ ...node })
        }
    }
    return result
}

/**
 * 菜单树拍平成路由：嵌套菜单在侧边栏保留层级，但路由全部挂成布局的一级子路由，
 * 上级标题保存在 meta.parents 中，供面包屑展示，无需嵌套页面容器。
 */
function flattenMenu(
    nodes: MenuNode[],
    parents: string[] = [],
): Array<{ node: MenuNode; parents: string[] }> {
    const flat: Array<{ node: MenuNode; parents: string[] }> = []
    for (const node of nodes) {
        flat.push({ node, parents })
        if (node.children?.length) {
            flat.push(...flattenMenu(node.children, [...parents, node.title]))
        }
    }
    return flat
}

/** 为每个可见菜单节点生成路由；业务页面接入时在此替换对应占位组件。 */
export function menuToRoutes(nodes: MenuNode[]): RouteRecordRaw[] {
    return flattenMenu(nodes).map(({ node, parents }) => ({
        path: node.path,
        name: `menu:${node.path}`,
        component: () => import('@/views/placeholder/ModulePlaceholder.vue'),
        meta: { title: node.title, parents },
    }))
}

/** 不需要登录的路由 */
export const publicRoutes: RouteRecordRaw[] = [
    {
        path: '/login',
        name: 'Login',
        component: () => import('@/views/login/index.vue'),
        meta: { title: '登录', public: true },
    },
    {
        path: '/test',
        name: 'TestPage',
        component: () => import('@/views/test/index.vue'),
        meta: { title: '测试页', public: true },
    },
]

export const LAYOUT_NAME = 'Layout'
