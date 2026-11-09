import type { EvaluationDetail, EvaluationInput } from '@/api/feedback-types'
import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
import type {
    Resource,
    ResourceInput,
    ResourceDetail,
    ResourceCandidates,
    LegacyContract,
} from '@/api/resource-types'
export const resourceApi = {
    evaluation: (resourceId: number, id: number): Promise<EvaluationDetail> =>
        http.get(`/resources/${resourceId}/cooperations/${id}/evaluation`),
    evaluate: (
        resourceId: number,
        id: number,
        input: EvaluationInput,
    ): Promise<{ id: number; version: number }> =>
        http.put(`/resources/${resourceId}/cooperations/${id}/evaluation`, input),

    list: (query: Record<string, unknown>): Promise<PageResult<Resource>> =>
        http.get('/resources', query),
    candidates: (): Promise<ResourceCandidates> => http.get('/resources/candidates'),
    detail: (id: number): Promise<ResourceDetail> => http.get(`/resources/${id}`),
    create: (input: ResourceInput): Promise<{ id: number }> => http.post('/resources', input),
    update: (id: number, input: ResourceInput, version: number) =>
        http.put(`/resources/${id}`, { ...input, version }),
    archive: (id: number, version: number, reason: string) =>
        http.post(`/resources/${id}/archive`, { version, reason }),
    saveChild: (
        id: number,
        kind: 'contacts' | 'cooperations' | 'followups',
        input: unknown,
        childId?: number,
    ) =>
        childId
            ? http.put(`/resources/${id}/${kind}/${childId}`, input)
            : http.post(`/resources/${id}/${kind}`, input),
    merge: (
        body: {
            sourceId: number
            targetId: number
            sourceVersion: number
            targetVersion: number
            reason: string
        },
        preview = false,
    ): Promise<Record<string, string | number>> =>
        http.post(`/resources/${preview ? 'merge-preview' : 'merge'}`, body),
    legacy: (): Promise<LegacyContract[]> => http.get('/resources/legacy-contracts'),
    link: (id: number, resourceId: number, version: number) =>
        http.post(`/resources/legacy-contracts/${id}/link`, { resourceId, version }),
}
