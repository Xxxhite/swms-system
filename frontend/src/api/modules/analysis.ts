import type { QualityKind, QualityReport } from '@/api/feedback-types'
import { mockFeedback } from '@/mock/feedback'
import { useMock } from '@/api/config'
import { mockReport } from '@/mock/management'
import type { ReportKind, ManagementQuery, ManagementReport } from '@/api/management-types'
import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
import { queryParams, type BusinessQuery, type Progress } from '@/api/business-types'
/** 查询与导出共用筛选参数，下载仍通过鉴权请求客户端。 */
export const analysisApi = {
    quality: (kind: QualityKind, q: Record<string, unknown>): Promise<QualityReport> =>
        useMock ? mockFeedback.report(kind, q) : http.get(`/analysis/quality/${kind}`, q),
    qualityExport: (kind: QualityKind, q: Record<string, unknown>): Promise<Blob> =>
        http.download(`/analysis/quality/${kind}/export`, q),

    management: (kind: ReportKind, q: ManagementQuery): Promise<ManagementReport> =>
        useMock ? mockReport(kind, q) : http.get(`/analysis/management/${kind}`, q),
    managementDetails: (kind: ReportKind, q: ManagementQuery): Promise<ManagementReport> =>
        useMock ? mockReport(kind, q) : http.get(`/analysis/management/${kind}/details`, q),
    managementExport: (kind: ReportKind, q: ManagementQuery): Promise<Blob> =>
        http.download(`/analysis/management/${kind}/export`, q),
    warnings: (q: BusinessQuery): Promise<PageResult<Progress>> =>
        http.get('/analysis/monthly-warnings', queryParams(q)),
    export: (q: BusinessQuery): Promise<Blob> =>
        http.download('/analysis/exports/monthly-warnings', queryParams(q)),
}
