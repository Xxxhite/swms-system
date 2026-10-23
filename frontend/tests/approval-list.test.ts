import { describe, expect, test } from 'bun:test'
import type { ApprovalTask, BusinessQuery } from '../src/api/business-types'
import type { PageResult } from '../src/api/types'
import { useApprovalList } from '../src/views/approval/useApprovalList'

function task(id: number): ApprovalTask {
    return {
        id,
        instanceId: id,
        approverId: 1,
        status: 'PENDING',
        version: 1,
        createdAt: '2026-10-23T00:00:00Z',
    }
}
function page(list: ApprovalTask[], total = list.length): PageResult<ApprovalTask> {
    return { list, total, page: 1, pageSize: 20 }
}

describe('审批成功后的列表同步', () => {
    test('待办立即移除；刷新失败仍保留已确认结果，重复同步不重复减数', async () => {
        const list = useApprovalList(async () => {
            throw new Error('刷新失败')
        })
        list.rows.value = [task(1), task(2)]
        list.total.value = 2
        list.applyDecision(1, true)
        list.applyDecision(1, true)
        expect(await list.load()).toBe('failed')
        expect(list.rows.value.map((r) => r.id)).toEqual([2])
        expect(list.total.value).toBe(1)
        expect(list.loading.value).toBe(false)
    })
    test('全部状态下保留记录并显示驳回，保留服务端版本等待刷新', () => {
        const list = useApprovalList(async () => page([]))
        list.query.status = ''
        list.rows.value = [task(1)]
        list.total.value = 1
        list.applyDecision(1, false)
        expect(list.rows.value[0]).toMatchObject({ status: 'REJECTED', version: 1 })
        expect(list.total.value).toBe(1)
    })
    test('决策前发出的迟到查询不能恢复待审状态', async () => {
        let resolve!: (value: PageResult<ApprovalTask>) => void
        const list = useApprovalList(
            () =>
                new Promise((yes) => {
                    resolve = yes
                }),
        )
        list.rows.value = [task(1)]
        list.total.value = 1
        const loading = list.load()
        list.applyDecision(1, true)
        resolve(page([task(1)]))
        expect(await loading).toBe('superseded')
        expect(list.rows.value).toEqual([])
        expect(list.total.value).toBe(0)
    })
    test('末页移除后回到有效页，刷新保留状态和排序；空页也会回退', async () => {
        const requests: BusinessQuery[] = []
        const list = useApprovalList(async (q) => {
            requests.push(q)
            return page([task(2)], 20)
        })
        Object.assign(list.query, { page: 2, sortBy: 'createdAt', sortOrder: 'desc' })
        list.rows.value = [task(1)]
        list.total.value = 21
        list.applyDecision(1, false)
        expect(list.query.page).toBe(1)
        await list.load()
        expect(requests[0]).toMatchObject({
            page: 1,
            status: 'PENDING',
            sortBy: 'createdAt',
            sortOrder: 'desc',
        })
        list.query.page = 3
        await list.load()
        expect(list.query.page).toBe(1)
        expect(list.rows.value[0]?.id).toBe(2)
    })
})
