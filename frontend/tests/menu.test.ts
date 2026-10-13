import { describe, expect, test } from 'bun:test'

import { PERM } from '../src/api/permissions'
import { filterMenuTree, menuTree, menuToRoutes } from '../src/router/routes'

describe('菜单权限', () => {
    test('社工只看到服务档案和知识管理，不注册系统管理路由', () => {
        const menu = filterMenuTree(menuTree, [PERM.SERVICE_ARCHIVE, PERM.KNOWLEDGE])
        expect(menu.map((item) => item.path)).toEqual(['/service', '/knowledge'])
        expect(menu[0]?.children?.map((item) => item.path)).toEqual(['/service/archive'])
        expect(menu[0]?.children?.[0]?.children).toHaveLength(9)
        expect(menuToRoutes(menu).some((route) => route.path === '/system')).toBe(false)
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
