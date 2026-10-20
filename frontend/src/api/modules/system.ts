import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
export interface AuditLog {
    id: number
    actorId: number | null
    action: string
    entityType: string
    entityId: number | null
    beforeData: unknown
    afterData: unknown
    createdAt: string
}
export const systemApi = {
    logs: (query: Record<string, unknown>): Promise<PageResult<AuditLog>> =>
        http.get('/system/logs', query),
}
