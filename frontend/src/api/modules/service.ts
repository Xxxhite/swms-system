import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
import {
    queryParams,
    type BusinessQuery,
    type Monthly,
    type MonthlyInput,
    type Progress,
} from '@/api/business-types'
/** 服务档案接口：提交后数量通过变更申请维护，普通保存仅用于草稿。 */
export const serviceApi = {
    context: (): Promise<{
        fixedProject: boolean
        projects: Array<{ id: number; name: string }>
        slots: Array<{
            projectId: number
            projectName: string
            indicatorId: number
            indicatorName: string
            unit: string
            teamId: number
            teamName: string
        }>
    }> => http.get('/service/reporting-context'),
    withdrawSubmission: (id: number) => http.post(`/service/records/${id}/withdraw`),
    progress: (q: BusinessQuery): Promise<PageResult<Progress>> =>
        http.get('/service/indicator-progress', queryParams(q)),
    list: (q: BusinessQuery): Promise<PageResult<Monthly>> =>
        http.get('/service/records', queryParams(q)),
    detail: (id: number): Promise<Monthly> => http.get(`/service/records/${id}`),
    save: (body: MonthlyInput, row?: Monthly) =>
        row
            ? http.put(`/service/records/${row.id}`, { ...body, version: row.version })
            : http.post('/service/records', body),
    submit: (r: Monthly) => http.post(`/service/records/${r.id}/submit`, { version: r.version }),
    remove: (r: Monthly) => http.delete(`/service/records/${r.id}`, { version: r.version }),
    change: (
        r: Monthly,
        body: { operation: string; actualValue?: string; note?: string; reason: string },
    ) =>
        http.post(`/service/records/${r.id}/change-requests`, {
            ...body,
            version: r.version,
        }),
    withdraw: (id: number) => http.post(`/service/record-change-requests/${id}/withdraw`),
}
