import { describe, expect, test } from 'bun:test'
import type { PageResult, UserSummary } from '../src/api/types'
import { useUserList } from '../src/views/system/users/useUserList'

function user(id: number, status: UserSummary['status'] = 'PENDING'): UserSummary {
    return {
        id,
        username: `test_${id}`,
        name: `测试人员${id}`,
        phone: '13800000000',
        status,
        proposedPosition: '社工',
        dataScope: 'SELF',
        version: status === 'PENDING' ? 1 : 2,
    }
}
function page(list: UserSummary[], total = list.length, pageNumber = 1): PageResult<UserSummary> {
    return { list, total, page: pageNumber, pageSize: 20 }
}
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: Error) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}

describe('人员与注册审核列表同步', () => {
    test('批准立即移除并减少总数，刷新失败仍保持已确认结果', async () => {
        const list = useUserList(
            () => true,
            async () => {
                throw new Error('连接失败')
            },
        )
        list.rows.value = [user(1), user(2)]
        list.total.value = 2
        list.applyReview(user(1, 'ACTIVE'))
        expect(list.rows.value.map((row) => row.id)).toEqual([2])
        expect(list.total.value).toBe(1)
        expect(await list.load()).toBe('failed')
        expect(list.rows.value.map((row) => row.id)).toEqual([2])
        expect(list.loading.value).toBe(false)
    })

    test('驳回更新状态和版本；仅待审核筛选下移除，其他行保留', () => {
        const list = useUserList(
            () => true,
            async () => page([]),
        )
        list.rows.value = [user(1), user(2)]
        list.total.value = 2
        list.applyReview(user(1, 'REJECTED'))
        expect(list.rows.value[0]).toMatchObject({ status: 'REJECTED', version: 2 })
        expect(list.total.value).toBe(2)
        list.query.status = 'PENDING'
        list.applyReview(user(1, 'REJECTED'))
        expect(list.rows.value.map((row) => row.id)).toEqual([2])
        expect(list.total.value).toBe(1)
    })

    test('最后一页最后一行批准后退回有效页并保留查询条件', async () => {
        const requests: Record<string, unknown>[] = []
        const list = useUserList(
            () => true,
            async (query) => {
                requests.push(query)
                return page([user(2)], 20)
            },
        )
        list.query.page = 2
        list.query.keyword = '测试'
        list.query.status = 'PENDING'
        list.rows.value = [user(21)]
        list.total.value = 21
        list.applyReview(user(21, 'ACTIVE'))
        expect(list.query.page).toBe(1)
        expect(list.total.value).toBe(20)
        expect(await list.load()).toBe('loaded')
        expect(requests).toEqual([{ page: 1, pageSize: 20, keyword: '测试', status: 'PENDING' }])
    })

    test('审核前发出的旧查询不能重新带回已批准记录', async () => {
        const old = deferred<PageResult<UserSummary>>()
        const list = useUserList(
            () => true,
            () => old.promise,
        )
        list.rows.value = [user(1)]
        list.total.value = 1
        const loading = list.load()
        list.applyReview(user(1, 'ACTIVE'))
        old.resolve(page([user(1)]))
        expect(await loading).toBe('superseded')
        expect(list.rows.value).toEqual([])
        expect(list.total.value).toBe(0)
        expect(list.loading.value).toBe(false)
    })

    test('并发查询只使用最新结果，旧请求失败不改变 loading 或结果', async () => {
        const old = deferred<PageResult<UserSummary>>()
        const latest = deferred<PageResult<UserSummary>>()
        let count = 0
        const list = useUserList(
            () => true,
            () => (++count === 1 ? old.promise : latest.promise),
        )
        const first = list.load()
        const second = list.load()
        old.reject(new Error('旧请求失败'))
        expect(await first).toBe('superseded')
        expect(list.loading.value).toBe(true)
        latest.resolve(page([user(2)]))
        expect(await second).toBe('loaded')
        expect(list.rows.value.map((row) => row.id)).toEqual([2])
        expect(list.loading.value).toBe(false)
    })

    test('服务器总数减少时自动回退空页，清空入口时使旧请求失效', async () => {
        const requests: unknown[] = []
        const list = useUserList(
            () => true,
            async (query) => {
                requests.push(query.page)
                return query.page === 2 ? page([], 1, 2) : page([user(1)])
            },
        )
        list.query.page = 2
        expect(await list.load()).toBe('loaded')
        expect(requests).toEqual([2, 1])
        expect(list.query.page).toBe(1)
        expect(list.rows.value).toHaveLength(1)
        expect(list.loading.value).toBe(false)
        const old = deferred<PageResult<UserSummary>>()
        const switched = useUserList(
            () => true,
            () => old.promise,
        )
        const loading = switched.load()
        switched.invalidate()
        old.resolve(page([user(1)]))
        expect(await loading).toBe('superseded')
        expect(switched.rows.value).toEqual([])
    })

    test('人员管理入口保留已启用人员且不会重复减少不存在的行', () => {
        const list = useUserList(
            () => false,
            async () => page([]),
        )
        list.rows.value = [user(1)]
        list.total.value = 1
        list.applyReview(user(1, 'ACTIVE'))
        expect(list.rows.value[0]?.status).toBe('ACTIVE')
        expect(list.total.value).toBe(1)
        list.applyReview(user(99, 'ACTIVE'))
        expect(list.total.value).toBe(1)
    })
})
