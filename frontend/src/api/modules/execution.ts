import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
import type {
    ExecutionDetail,
    ExecutionPolicy,
    FieldTask,
    Participant,
    AttendancePayload,
    LifecyclePayload,
    ParticipationPayload,
    Evidence,
    ExecutionException,
} from '@/api/execution-types'
const base = (id: number) => `/service/tasks/${id}/execution`
export const executionApi = {
    mine: (page = 1): Promise<PageResult<FieldTask>> =>
        http.get('/service/execution/my-tasks', { page, pageSize: 20 }),
    detail: (id: number): Promise<ExecutionDetail> => http.get(base(id)),
    policy: (d: ExecutionDetail, p: ExecutionPolicy, reason: string) =>
        http.put(`${base(d.taskId)}/policy`, {
            locationCheckEnabled: p.locationCheckEnabled,
            latitude: p.latitude,
            longitude: p.longitude,
            radius: p.radius,
            accuracyLimit: p.accuracyLimit,
            beforeMinutes: p.beforeMinutes,
            afterMinutes: p.afterMinutes,
            toleranceMinutes: p.toleranceMinutes,
            credentialMinutes: p.credentialMinutes,
            supplementHours: p.supplementHours,
            version: d.policyVersion,
            taskVersion: d.taskVersion,
            reason,
        }),
    lifecycle: (id: number, kind: 'start' | 'end', input: LifecyclePayload) =>
        http.post(`${base(id)}/${kind}`, input),
    stop: (id: number, input: { sourceVersion: number; requestKey: string; reason: string }) =>
        http.post(`${base(id)}/stop`, input),
    attendance: (id: number, input: AttendancePayload) =>
        http.post(`${base(id)}/attendance`, input),
    participants: (taskId: number): Promise<Participant[]> =>
        http.get('/service/participants', { taskId }),
    createParticipant: (input: {
        taskId: number
        projectId: number
        name: string
        phone?: string
        requestKey: string
    }): Promise<{ id: number; duplicateName?: boolean }> =>
        http.post('/service/participants', input),
    updateParticipant: (
        id: number,
        input: { taskId: number; version: number; name: string; phone?: string; reason: string },
    ) => http.put(`/service/participants/${id}`, input),
    archiveParticipant: (p: Participant, taskId: number, reason: string) =>
        http.post(`/service/participants/${p.id}/archive`, {
            taskId,
            version: p.version,
            name: p.name,
            reason,
        }),
    addParticipant: (taskId: number, participantId: number) =>
        http.post(`${base(taskId)}/participants`, { participantId }),
    confirm: (taskId: number, rosterId: number, input: ParticipationPayload) =>
        http.post(
            `${base(taskId)}/participants/${rosterId}/${input.kind === 'VOID' ? 'void' : 'confirm'}`,
            input,
        ),
    issue: (
        taskId: number,
        input: {
            sourceVersion: number
            requestKey: string
            rosterId: number
            purpose: 'COLLECTIVE' | 'HOME_CONFIRM'
        },
    ): Promise<{ id: number; token: string; expiresAt: string }> =>
        http.post(`${base(taskId)}/credentials`, input),
    revoke: (taskId: number, id: number, reason: string) =>
        http.post(`${base(taskId)}/credentials/${id}/revoke`, { reason }),
    evidence: (taskId: number): Promise<Evidence[]> => http.get(`${base(taskId)}/evidence`),
    upload: (taskId: number, file: File, requestKey: string): Promise<Evidence> => {
        const body = new FormData()
        body.append('file', file)
        body.append('requestKey', requestKey)
        return http.post(`${base(taskId)}/evidence`, body, { timeout: 60000 })
    },
    download: (id: number) => http.download(`/execution/evidence/${id}/download`),
    remove: (id: number) => http.delete(`/execution/evidence/${id}`),
    exceptions: (): Promise<ExecutionException[]> => http.get('/execution/exceptions'),
    explain: (e: ExecutionException, reason: string, evidenceIds: number[], requestKey: string) =>
        http.post(`/execution/exceptions/${e.id}/notes`, {
            version: e.version,
            reason,
            evidenceIds,
            requestKey,
        }),
}
