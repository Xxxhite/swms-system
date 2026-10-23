import { describe, expect, test } from 'bun:test'
import { reactive } from 'vue'
import { sortTableRows, useTableSort, type SortQuery } from '../src/utils/tableSort'
import { organizationTree } from '../src/views/system/shared'
import { useUserList } from '../src/views/system/users/useUserList'

describe('表格排序与查询联动', () => {
    test('切换列返回第一页；取消和重置恢复表头及参数，避免重复查询', () => {
        const query = reactive<SortQuery>({ page: 4 })
        let requests = 0
        const headers: string[] = []
        const sort = useTableSort(query, 'createdAt', 'descending', () => requests++)
        sort.setTableRef({
            sort(prop: string, order: 'ascending' | 'descending') {
                headers.push(`${prop}:${order}`)
                sort.onSortChange({ prop, order })
            },
        })
        sort.onSortChange({ prop: 'name', order: 'ascending' })
        expect(query).toEqual({ page: 1, sortBy: 'name', sortOrder: 'asc' })
        expect(requests).toBe(1)
        sort.onSortChange({ prop: null, order: null })
        expect(query.sortBy).toBe('createdAt')
        expect(query.sortOrder).toBe('desc')
        expect(headers).toEqual(['createdAt:descending'])
        expect(requests).toBe(2)
        sort.onSortChange({ prop: 'name', order: 'ascending' })
        sort.resetSort()
        expect(requests).toBe(3)
        expect(query.sortBy).toBe('createdAt')
    })
    test('小表精确比较目标，空值始终最后，时间比较使用原始时刻', () => {
        const rows = [
            { id: 1, targetValue: '10.00', createdAt: '2026-10-23T01:00:00Z' },
            { id: 2, targetValue: '2.00', createdAt: '2026-10-23T09:00:00+08:00' },
            { id: 3, targetValue: undefined, createdAt: '2026-10-22T01:00:00Z' },
        ]
        expect(sortTableRows(rows, {}).map((r) => r.id)).toEqual([2, 1, 3])
        expect(
            sortTableRows(rows, { sortBy: 'targetValue', sortOrder: 'asc' }, undefined, [
                'targetValue',
            ]).map((r) => r.id),
        ).toEqual([2, 1, 3])
        expect(
            sortTableRows(rows, { sortBy: 'targetValue', sortOrder: 'desc' }, undefined, [
                'targetValue',
            ]).map((r) => r.id),
        ).toEqual([1, 2, 3])
        expect(rows.map((r) => r.id)).toEqual([1, 2, 3])
    })
    test('组织仅重排同级，子节点始终保留在所属父级下', () => {
        const rows = [
            {
                id: 1,
                parentId: null,
                name: '总部',
                code: 'root',
                type: 'HEADQUARTERS' as const,
                status: 'ACTIVE' as const,
                sortOrder: 0,
                version: 1,
            },
            {
                id: 2,
                parentId: 1,
                name: '张组',
                code: 'z',
                type: 'TEAM' as const,
                status: 'ACTIVE' as const,
                sortOrder: 1,
                version: 1,
            },
            {
                id: 3,
                parentId: 1,
                name: '李组',
                code: 'l',
                type: 'TEAM' as const,
                status: 'ACTIVE' as const,
                sortOrder: 2,
                version: 1,
            },
        ]
        expect(organizationTree(rows)[0]?.children.map((r) => r.id)).toEqual([2, 3])
        const sorted = organizationTree(rows, { sortBy: 'name', sortOrder: 'asc' })
        expect(sorted.map((r) => r.id)).toEqual([1])
        expect(sorted[0]?.children.map((r) => r.id)).toEqual([3, 2])
    })
    test('人员列表请求保留筛选与排序参数，页码归一后读取', async () => {
        const requests: Record<string, unknown>[] = []
        const list = useUserList(
            () => false,
            async (query) => {
                requests.push(query)
                return { list: [], total: 0, page: 1, pageSize: 20 }
            },
        )
        const sort = useTableSort(list.query, 'createdAt', 'descending', () => {})
        list.query.keyword = '测试'
        list.query.page = 3
        sort.onSortChange({ prop: 'name', order: 'ascending' })
        await list.load()
        expect(requests).toEqual([
            { page: 1, pageSize: 20, keyword: '测试', sortBy: 'name', sortOrder: 'asc' },
        ])
    })
})
