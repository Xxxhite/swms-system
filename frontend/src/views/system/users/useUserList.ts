import { reactive, ref } from 'vue'
import type { SortQuery } from '@/utils/tableSort'
import type { PageResult, UserSummary } from '@/api/types'

type LoadResult = 'loaded' | 'failed' | 'superseded'
type FetchUsers = (
    query: Record<string, unknown>,
    registrations: boolean,
) => Promise<PageResult<UserSummary>>

/** 管理人员／审核列表：隔离过期查询，并在审核提交成功后立即同步服务端返回的状态。 */
export function useUserList(isRegistration: () => boolean, fetchUsers: FetchUsers) {
    const rows = ref<UserSummary[]>([])
    const total = ref(0)
    const loading = ref(false)
    const query = reactive<
        { page: number; pageSize: number; keyword: string; status: string } & SortQuery
    >({ page: 1, pageSize: 20, keyword: '', status: '' })
    let generation = 0

    /** 使旧查询失效；路由切换及审核结果落地时均不再接受旧响应。 */
    function invalidate() {
        generation++
        loading.value = false
    }

    /** 读取当前筛选，必要时回到仍存在的最后一页；失败与被更新请求取代分别返回。 */
    async function load(): Promise<LoadResult> {
        const request = ++generation
        loading.value = true
        try {
            const result = await fetchUsers(
                {
                    page: query.page,
                    pageSize: query.pageSize,
                    ...(query.sortBy ? { sortBy: query.sortBy, sortOrder: query.sortOrder } : {}),
                    ...(query.keyword ? { keyword: query.keyword } : {}),
                    ...(query.status ? { status: query.status } : {}),
                },
                isRegistration(),
            )
            if (request !== generation) return 'superseded'
            const lastPage = Math.max(1, Math.ceil(result.total / query.pageSize))
            if (query.page > lastPage) {
                query.page = lastPage
                return await load()
            }
            rows.value = result.list
            total.value = result.total
            return 'loaded'
        } catch {
            // 请求层已提示网络错误，调用方用结果区分业务提交成功后的刷新失败。
            return request === generation ? 'failed' : 'superseded'
        } finally {
            if (request === generation) loading.value = false
        }
    }

    /** 只在审核接口成功后调用；按当前列表筛选移除或替换行，不等待后续刷新。 */
    function applyReview(updated: UserSummary) {
        invalidate()
        const index = rows.value.findIndex((row) => row.id === updated.id)
        if (index === -1) return
        const visible =
            (!isRegistration() || ['PENDING', 'REJECTED'].includes(updated.status)) &&
            (!query.status || query.status === updated.status)
        if (visible) rows.value[index] = updated
        else {
            rows.value = rows.value.filter((row) => row.id !== updated.id)
            total.value = Math.max(0, total.value - 1)
            query.page = Math.min(query.page, Math.max(1, Math.ceil(total.value / query.pageSize)))
        }
    }

    return { rows, total, loading, query, load, invalidate, applyReview }
}
