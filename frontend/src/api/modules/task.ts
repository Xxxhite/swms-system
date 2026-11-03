import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
import type { Task, TaskInput, TaskPreview, TaskCandidates, Recurrence } from '@/api/task-types'
export type TaskWrite = TaskInput & {
    requestKey: string
    recurrence?: Recurrence
    previewToken?: string
    conflictReason?: string
}
export const taskApi = {
    list: (query: Record<string, unknown>): Promise<PageResult<Task>> =>
        http.get('/service/tasks', query),
    calendar: (query: Record<string, unknown>): Promise<{ list: Task[]; total: number }> =>
        http.get('/service/tasks/calendar', query),
    candidates: (query: Record<string, unknown> = {}): Promise<TaskCandidates> =>
        http.get('/service/tasks/candidates', query),
    detail: (id: number): Promise<Task> => http.get(`/service/tasks/${id}`),
    preview: (
        input: TaskInput & { recurrence?: Recurrence; excludeId?: number },
    ): Promise<TaskPreview> => http.post('/service/tasks/preview', input),
    create: (input: TaskWrite, sourceId?: number): Promise<{ id: number; ids: number[] }> =>
        http.post(sourceId ? `/service/tasks/${sourceId}/copy` : '/service/tasks/batch', input),
    update: (
        id: number,
        input: TaskInput & {
            version: number
            reason: string
            previewToken?: string
            conflictReason?: string
        },
    ) => http.put(`/service/tasks/${id}`, input),
    cancel: (id: number, version: number, reason: string) =>
        http.post(`/service/tasks/${id}/cancel`, { version, reason }),
}
