import { http } from '@/api/request'
import type {
    OutcomeDetail,
    OutcomeSource,
    OutcomeReviewInput,
    OutcomePreview,
    CalculationRule,
    CalculationMode,
} from '@/api/outcome-types'
import type { Evidence } from '@/api/execution-types'
const base = (id: number) => `/service/tasks/${id}/outcome`
export const outcomeApi = {
    detail: (id: number): Promise<OutcomeDetail> => http.get(base(id)),
    generate: (id: number) => http.post(base(id)),
    save: (
        id: number,
        body: {
            version: number
            sourceVersion: number
            summary: string
            manualValues: Record<string, string>
            evidenceIds: number[]
        },
    ) => http.put(base(id), body),
    submit: (
        id: number,
        body: { version: number; sourceVersion: number; recordIds: number[]; requestKey: string },
    ) => http.post(`${base(id)}/submit`, body),
    withdrawSummary: (id: number) => http.post(`${base(id)}/withdraw`),
    snapshot: (id: number): Promise<{ id: number; source: OutcomeSource }> =>
        http.get(`/service/outcome-snapshots/${id}`),
    upload: (id: number, file: File, requestKey: string): Promise<Evidence> => {
        const body = new FormData()
        body.append('file', file)
        body.append('requestKey', requestKey)
        return http.post(`${base(id)}/evidence`, body, { timeout: 60000 })
    },
    preview: (id: number, body: OutcomeReviewInput): Promise<OutcomePreview> =>
        http.post(`/approvals/tasks/${id}/outcome-preview`, body),
    rules: (id: number): Promise<CalculationRule[]> =>
        http.get(`/service/indicators/${id}/calculation-rule`),
    saveRule: (
        id: number,
        body: { mode: CalculationMode; effectiveDate: string; revision: number; reason: string },
    ) => http.put(`/service/indicators/${id}/calculation-rule`, body),
}
