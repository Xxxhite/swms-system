import type { RouteRecordRaw } from 'vue-router'

import { PERM } from '@/api/permissions'

/** 菜单节点：既是侧边菜单的数据源，也是动态路由的来源 */
export interface MenuNode {
    path: string
    title: string
    /** 功能权限码；不填表示任何登录用户都能看到 */
    permission?: string
    layout?: 'field'
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
            { path: '/service/monitor', title: '指标监测', permission: PERM.SERVICE_MONITOR },
            {
                path: '/service/contract-package-projects',
                title: '合同包项目管理',
                permission: PERM.PROJECT_RECORD_VIEW,
            },
            {
                path: '/field/tasks',
                title: '手机现场',
                permission: PERM.EXECUTION_VIEW,
                layout: 'field',
            },
            { path: '/service/plans', title: '阶段计划', permission: PERM.PLAN_VIEW },
            { path: '/service/records', title: '服务档案填报', permission: PERM.MONTHLY_VIEW },
            { path: '/service/approvals', title: '服务档案审批', permission: PERM.MONTHLY_APPROVE },
        ],
    },
    { path: '/project', title: '总部项目管理', permission: PERM.PROJECT },
    { path: '/activity', title: '服务任务', permission: PERM.ACTIVITY },
    { path: '/resource', title: '资源管理', permission: PERM.RESOURCE },
    { path: '/analysis', title: '数据分析', permission: PERM.ANALYSIS },
    { path: '/knowledge', title: '知识管理', permission: PERM.KNOWLEDGE },
    {
        path: '/system',
        title: '系统管理',
        permission: PERM.SYSTEM,
        children: [
            { path: '/system/organizations', title: '组织管理', permission: PERM.ORG_MANAGE },
            { path: '/system/users', title: '人员管理', permission: PERM.USER_VIEW },
            {
                path: '/system/registrations',
                title: '注册审核',
                permission: PERM.REGISTRATION_VIEW,
            },
            { path: '/system/roles', title: '角色权限', permission: PERM.ROLE_MANAGE },
            { path: '/system/logs', title: '操作日志', permission: PERM.LOG_VIEW },
        ],
    },
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
    const pages: Record<string, RouteRecordRaw['component']> = {
        '/activity': () => import('@/views/activity/index.vue'),
        '/service/plans': () => import('@/views/service/plans/index.vue'),
        '/resource': () => import('@/views/resource/index.vue'),
        '/project': () => import('@/views/project/headquarters.vue'),
        '/service/contract-package-projects': () => import('@/views/project/index.vue'),
        '/service/monitor': () => import('@/views/service/monitor/index.vue'),
        '/service/records': () => import('@/views/service/monthly-reports/index.vue'),
        '/service/approvals': () => import('@/views/approval/index.vue'),
        '/analysis': () => import('@/views/analysis/index.vue'),
        '/system/organizations': () => import('@/views/system/organizations/index.vue'),
        '/system/users': () => import('@/views/system/users/index.vue'),
        '/system/registrations': () => import('@/views/system/users/index.vue'),
        '/system/roles': () => import('@/views/system/roles/index.vue'),
        '/system/logs': () => import('@/views/system/audit/index.vue'),
    }
    const routes: RouteRecordRaw[] = flattenMenu(nodes)
        .filter(({ node }) => node.layout !== 'field')
        .map(({ node, parents }) => ({
            path: node.path,
            name: `menu:${node.path}`,
            component:
                pages[node.path] ?? (() => import('@/views/placeholder/ModulePlaceholder.vue')),
            meta: { title: node.title, parents },
        }))
    if (routes.some((route) => route.path === '/service/contract-package-projects'))
        routes.push({
            path: '/service/contract-package-projects/:id',
            name: 'ProjectDetail',
            component: () => import('@/views/project/detail.vue'),
            meta: { title: '项目详情', parents: ['服务管理', '合同包项目管理'] },
        })
    if (routes.some((r) => r.path === '/resource'))
        routes.push({
            path: '/resource/:id',
            name: 'ResourceDetail',
            component: () => import('@/views/resource/detail.vue'),
            meta: { title: '资源详情', parents: ['资源管理'] },
        })
    if (routes.some((r) => r.path === '/activity'))
        routes.push({
            path: '/activity/:id',
            name: 'TaskDetail',
            component: () => import('@/views/activity/detail.vue'),
            meta: { title: '任务详情', parents: ['服务任务'] },
        })
    if (routes.some((r) => r.path === '/service/plans'))
        routes.push({
            path: '/service/plans/:id',
            name: 'PlanDetail',
            component: () => import('@/views/service/plans/detail.vue'),
            meta: { title: '计划详情', parents: ['服务管理', '阶段计划'] },
        })
    const aliases: Array<[string, string]> = [
        ['/service/monthly-reports', '/service/records'],
        ['/service/archive', '/service/records'],
        ...['activity', 'volunteer', 'record', 'visit', 'consult', 'meeting', 'monthly'].map(
            (kind): [string, string] => [`/service/archive/${kind}`, '/service/records'],
        ),
        ['/approvals', '/service/approvals'],
        ['/service/approval', '/service/approvals'],
    ]
    for (const [path, redirect] of aliases)
        if (routes.some((r) => r.path === redirect)) routes.push({ path, redirect })
    if (routes.some((r) => r.path === '/service/contract-package-projects'))
        routes.push({
            path: '/project/:id',
            redirect: (to) => `/service/contract-package-projects/${String(to.params.id)}`,
        })
    return routes
}

/** 不需要登录的路由 */
export const publicRoutes: RouteRecordRaw[] = [
    {
        path: '/participation',
        name: 'Participation',
        component: () => import('@/views/participation/index.vue'),
        meta: { title: '参与确认', public: true },
    },
    {
        path: '/register',
        name: 'Register',
        component: () => import('@/views/register/index.vue'),
        meta: { title: '员工注册', public: true },
    },
    {
        path: '/account-status',
        name: 'AccountStatus',
        component: () => import('@/views/account-status/index.vue'),
        meta: { title: '注册审核状态' },
    },
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
export const FIELD_LAYOUT_NAME = 'FieldLayout'
export function fieldRoutes(permissions: string[]): RouteRecordRaw[] {
    if (!permissions.includes(PERM.EXECUTION_VIEW)) return []
    const children: RouteRecordRaw[] = [
        {
            path: 'tasks',
            name: 'FieldTasks',
            component: () => import('@/views/field/index.vue'),
            meta: { title: '我的现场任务' },
        },
        {
            path: 'tasks/:id',
            name: 'FieldTaskDetail',
            component: () => import('@/views/field/detail.vue'),
            meta: { title: '现场任务' },
        },
    ]
    if (permissions.includes(PERM.EXCEPTION_VIEW))
        children.push({
            path: 'exceptions',
            name: 'FieldExceptions',
            component: () => import('@/views/field/exceptions.vue'),
            meta: { title: '异常与核验' },
        })
    return [
        {
            path: '/field',
            name: FIELD_LAYOUT_NAME,
            component: () => import('@/layouts/FieldLayout.vue'),
            redirect: '/field/tasks',
            children,
        },
    ]
}
