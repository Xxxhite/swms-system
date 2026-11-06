import { describe, expect, test } from 'bun:test'
import { PERM } from '../src/api/permissions'
import { filterMenuTree, menuToRoutes, menuTree } from '../src/router/routes'
import { mockLogin } from '../src/mock/auth'
import type { CurrentUser } from '../src/api/types'
describe('B5职责入口隔离', () => {
    test('维护动作不能单独注册管理跟进页面，查看动作可打开页面', () => {
        const paths = (permissions: string[]) =>
            menuToRoutes(filterMenuTree(menuTree, permissions)).map((r) => r.path)
        expect(paths([PERM.MANAGEMENT_MANAGE])).not.toContain('/service/management-followups')
        expect(paths([PERM.MANAGEMENT_VIEW])).toContain('/service/management-followups')
        expect(paths([])).not.toContain('/service/management-followups')
    })
    test('四类演示账号具备管理入口，社工保持系统管理隔离', () => {
        for (const username of ['admin', 'supervisor', 'leader', 'social']) {
            const result = mockLogin({ data: { username, password: '123456' } })
            const user = (result.data as { user: CurrentUser }).user
            const paths = menuToRoutes(filterMenuTree(menuTree, user.permissions)).map(
                (r) => r.path,
            )
            expect(paths).toContain('/service/management-followups')
            if (username === 'social') expect(paths).not.toContain('/system/users')
        }
    })
})
