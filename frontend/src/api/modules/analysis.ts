import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
import { queryParams, type BusinessQuery, type Progress } from '@/api/business-types'
/** 查询与导出共用筛选参数，下载仍通过鉴权请求客户端。 */
export const analysisApi = {
    warnings: (q: BusinessQuery): Promise<PageResult<Progress>> =>
        http.get('/analysis/monthly-warnings', queryParams(q)),
    export: (q: BusinessQuery): Promise<Blob> =>
        http.download('/analysis/exports/monthly-warnings', queryParams(q)),
}
