import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
import type { Plan, PlanInput } from '@/api/task-types'
export const planApi = {
    list: (query: Record<string, unknown>): Promise<PageResult<Plan>> =>
        http.get('/service/plans', query),
    detail: (id: number): Promise<Plan> => http.get(`/service/plans/${id}`),
    create: (input: PlanInput): Promise<{ id: number }> => http.post('/service/plans', input),
    update: (id: number, input: PlanInput, version: number) =>
        http.put(`/service/plans/${id}`, { ...input, version }),
    publish: (id: number, version: number) =>
        http.post(`/service/plans/${id}/publish`, { version }),
    copy: (id: number, effectiveDate: string, reason: string): Promise<{ id: number }> =>
        http.post(`/service/plans/${id}/copy`, { effectiveDate, reason }),
}
