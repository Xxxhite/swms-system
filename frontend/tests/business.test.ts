import { describe, expect, test } from 'bun:test'
import { PERM } from '../src/api/permissions'
import { filterMenuTree, menuTree, menuToRoutes } from '../src/router/routes'
import { queryParams } from '../src/api/business-types'
describe('业务导航与筛选', () => {
    test('项目详情随项目入口授权，退出时仍统一由布局清理', () => {
        const routes = menuToRoutes(filterMenuTree(menuTree, [PERM.PROJECT_RECORD_VIEW]))
        expect(routes.map((r) => r.path)).toContain('/project/:id')
        expect(
            menuToRoutes(filterMenuTree(menuTree, [PERM.KNOWLEDGE])).some(
                (r) => r.path === '/project/:id',
            ),
        ).toBe(false)
    })
    test('填报与审批入口分别授权', () => {
        const routes = menuToRoutes(filterMenuTree(menuTree, [PERM.MONTHLY_VIEW]))
        expect(routes.some((r) => r.path === '/service/monthly-reports')).toBe(true)
        expect(routes.some((r) => r.path === '/service/approvals')).toBe(false)
        expect(
            menuToRoutes(filterMenuTree(menuTree, [PERM.MONTHLY_APPROVE])).some(
                (r) => r.path === '/service/approvals',
            ),
        ).toBe(true)
    })
    test('空条件不发送，页码和业务日期保留', () => {
        expect(
            queryParams({
                page: 1,
                pageSize: 20,
                keyword: '',
                teamId: undefined,
                asOfDate: '2026-10-21',
            }),
        ).toEqual({ page: 1, pageSize: 20, asOfDate: '2026-10-21' })
    })
})
