import { reactive, ref } from 'vue'
import type { ApprovalTask, BusinessQuery } from '@/api/business-types'
import type { PageResult } from '@/api/types'

/** 审批列表在决策成功后立即同步，并隔离决策前发出的旧查询。 */
export function useApprovalList(
    fetchTasks: (query: BusinessQuery) => Promise<PageResult<ApprovalTask>>,
) {
    const rows = ref<ApprovalTask[]>([])
    const total = ref(0)
    const loading = ref(false)
    const query = reactive({ page: 1, pageSize: 20, status: 'PENDING' })
    let generation = 0

    /** 刷新失败保留已确认状态；最后一页为空时回到仍存在的页码。 */
    async function load(): Promise<'loaded' | 'failed' | 'superseded'> {
        const request = ++generation
        loading.value = true
        try {
            const result = await fetchTasks({ ...query })
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
            return request === generation ? 'failed' : 'superseded'
        } finally {
            if (request === generation) loading.value = false
        }
    }

    /** 仅在决策接口成功后调用；按筛选移除待办或更新状态，不推测服务端版本。 */
    function applyDecision(id: number, approved: boolean) {
        generation++
        loading.value = false
        const row = rows.value.find((item) => item.id === id)
        if (!row) return
        row.status = approved ? 'APPROVED' : 'REJECTED'
        if (query.status && query.status !== row.status) {
            rows.value = rows.value.filter((item) => item.id !== id)
            total.value = Math.max(0, total.value - 1)
            query.page = Math.min(query.page, Math.max(1, Math.ceil(total.value / query.pageSize)))
        }
    }
    return { rows, total, loading, query, load, applyDecision }
}
