import { describe, expect, test } from 'bun:test'
import { organizationTree } from '../src/views/system/shared'
import { filterMenuTree, menuTree, menuToRoutes } from '../src/router/routes'
import { PERM } from '../src/api/permissions'

describe('身份管理导航与组织树', () => {
    test('人员只读权限只注册人员入口，不提供审核和授权入口', () => {
        const menu = filterMenuTree(menuTree, [PERM.SYSTEM, PERM.USER_VIEW])
        const routes = menuToRoutes(menu).map((item) => item.path)
        expect(routes).toEqual(['/system', '/system/users'])
        expect(routes).not.toContain('/system/registrations')
        expect(routes).not.toContain('/system/roles')
    })
    test('裁剪后的组织子树仍以可见节点为根，构造过程不修改输入', () => {
        const rows = [
            {
                id: 2,
                parentId: 1,
                name: '部门',
                code: 'dept',
                type: 'DEPARTMENT' as const,
                status: 'ACTIVE' as const,
                sortOrder: 0,
                version: 1,
            },
            {
                id: 3,
                parentId: 2,
                name: '团队',
                code: 'team',
                type: 'TEAM' as const,
                status: 'ACTIVE' as const,
                sortOrder: 0,
                version: 1,
            },
        ]
        const before = structuredClone(rows)
        const tree = organizationTree(rows)
        expect(tree).toHaveLength(1)
        expect(tree[0]?.children[0]?.id).toBe(3)
        expect(rows).toEqual(before)
    })
})
