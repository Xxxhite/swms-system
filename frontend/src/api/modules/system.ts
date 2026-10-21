import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
export interface AuditLog {
    id: number
    actorId: number | null
    actorName: string | null
    action: string
    entityType: string
    entityId: number | null
    beforeData: unknown
    afterData: unknown
    createdAt: string
}
/** 系统日志接口：提供管理员审计查询，统一使用后端分页格式。 */
export const systemApi = {
    /** 按操作人、动作、对象及日期等条件分页读取脱敏日志。 */
    logs: (query: Record<string, unknown>): Promise<PageResult<AuditLog>> =>
        http.get('/system/logs', query),
}
