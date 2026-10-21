import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
import {
    queryParams,
    type BusinessQuery,
    type Monthly,
    type MonthlyInput,
    type Progress,
} from '@/api/business-types'
/** 月报接口：提交后数量通过变更申请维护，普通保存仅用于草稿。 */
export const serviceApi = {
    progress: (q: BusinessQuery): Promise<PageResult<Progress>> =>
        http.get('/service/indicator-progress', queryParams(q)),
    list: (q: BusinessQuery): Promise<PageResult<Monthly>> =>
        http.get('/service/monthly-reports', queryParams(q)),
    detail: (id: number): Promise<Monthly> => http.get(`/service/monthly-reports/${id}`),
    save: (body: MonthlyInput, row?: Monthly) =>
        row
            ? http.put(`/service/monthly-reports/${row.id}`, { ...body, version: row.version })
            : http.post('/service/monthly-reports', body),
    submit: (r: Monthly) =>
        http.post(`/service/monthly-reports/${r.id}/submit`, { version: r.version }),
    remove: (r: Monthly) => http.delete(`/service/monthly-reports/${r.id}`, { version: r.version }),
    change: (
        r: Monthly,
        body: { operation: string; actualValue?: string; note?: string; reason: string },
    ) =>
        http.post(`/service/monthly-reports/${r.id}/change-requests`, {
            ...body,
            version: r.version,
        }),
    withdraw: (id: number) => http.post(`/service/monthly-change-requests/${id}/withdraw`),
}
