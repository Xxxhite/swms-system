import { describe, expect, test } from 'bun:test'

import { PERM } from '../src/api/permissions'
import { filterMenuTree, menuTree, menuToRoutes } from '../src/router/routes'

describe('菜单权限', () => {
    test('社工只看到服务档案和知识管理，不注册系统管理路由', () => {
        const menu = filterMenuTree(menuTree, [PERM.MONTHLY_VIEW, PERM.KNOWLEDGE])
        expect(menu.map((item) => item.path)).toEqual(['/service', '/knowledge'])
        expect(menu[0]?.children?.map((item) => item.path)).toEqual(['/service/records'])
        expect(menu[0]?.children?.[0]?.title).toBe('服务档案填报')
        const paths = menuToRoutes(menu).map((route) => route.path)
        expect(paths).not.toContain('/service/archive/case')
        expect(paths).not.toContain('/service/archive/group')
        expect(paths).toContain('/service/records')
        expect(menu[0]?.children?.some((m) => m.path === '/service/monthly-reports')).toBe(false)
        expect(paths).not.toContain('/system')
    })

    test('没有权限时不留下空父菜单', () => {
        expect(filterMenuTree(menuTree, [])).toEqual([])
    })

    test('过滤角色菜单不会修改原始菜单树', () => {
        const original = structuredClone(menuTree)
        filterMenuTree(menuTree, [PERM.KNOWLEDGE])
        expect(menuTree).toEqual(original)
    })
})
