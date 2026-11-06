import { http } from '@/api/request'
import { useMock } from '@/api/config'
import { mockManagement } from '@/mock/management'
import type { PageResult } from '@/api/types'
import type {
    ManagementQuery,
    Followup,
    FollowupInput,
    ManagementCandidates,
} from '@/api/management-types'
export const managementApi = {
    list: (query: ManagementQuery): Promise<PageResult<Followup>> =>
        useMock ? mockManagement.list(query) : http.get('/management-followups', query),
    candidates: (): Promise<ManagementCandidates> =>
        useMock ? mockManagement.candidates() : http.get('/management-followups/candidates'),
    detail: (id: number): Promise<Followup> =>
        useMock ? mockManagement.detail(id) : http.get(`/management-followups/${id}`),
    create: (input: FollowupInput): Promise<{ id: number }> =>
        useMock ? mockManagement.create() : http.post('/management-followups', input),
    update: (
        id: number,
        input: Pick<
            FollowupInput,
            'title' | 'description' | 'ownerId' | 'dueDate' | 'requestKey'
        > & { version: number; reason: string },
    ): Promise<{ id: number }> =>
        useMock ? mockManagement.create() : http.put(`/management-followups/${id}`, input),
    transition: (
        id: number,
        input: {
            action: 'START' | 'NOTE' | 'COMPLETE' | 'REOPEN'
            note: string
            version: number
            requestKey: string
        },
    ): Promise<{ id: number }> =>
        useMock
            ? mockManagement.transition(id, input)
            : http.post(`/management-followups/${id}/transition`, input),
}
