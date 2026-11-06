import type { PageResult } from './types'
export type ReportKind = 'progress' | 'tasks' | 'approvals' | 'resources'
export type ManagementQuery = Record<string, string | number | undefined>
export type ReportRow = {
    key: string
    href: string
    status: string
    [key: string]: string | number | null
}
export interface ManagementReport extends PageResult<ReportRow> {
    options?: { owners: { id: number; name: string }[]; indicators: { id: number; name: string }[] }
    kind: ReportKind
    title: string
    columns: { key: string; label: string }[]
    groups: { name: string; value: number }[]
    averages: { name: string; samples: number; hours: number | null }[]
    meta: {
        filters: ManagementQuery
        referenceTime: string
        generatedAt: string
        fingerprint: string
        basis: string
        version: string
        total: number
    }
}
export interface DutyItem {
    key: string
    title: string
    detail: string
    href: string
    dueDate: string | null
}
export interface DutyGroup {
    key: string
    title: string
    total: number
    list: DutyItem[]
    error?: string
}
export interface DashboardOverview {
    groups: DutyGroup[]
    events: { key: string; title: string; createdAt: string; href: string }[]
    generatedAt: string
}
export type SourceType = 'PROJECT' | 'INDICATOR' | 'PLAN' | 'TASK' | 'RECORD'
export interface FollowupInput {
    projectId: number
    teamId: number | null
    sourceType: SourceType
    sourceId: number
    title: string
    description: string
    ownerId: number
    dueDate: string
    requestKey: string
}
export interface Followup extends Omit<FollowupInput, 'requestKey'> {
    id: number
    status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'
    result: string
    version: number
    ownerName: string
    projectName: string
    teamName: string
    href: string
    canManage: boolean
    canProcess: boolean
    needsReassignment?: boolean
    overdue: boolean
    createdAt: string
    updatedAt: string
    completedAt: string | null
    events?: {
        id: number
        action: string
        note: string
        createdAt: string
        actorName: string
        beforeData: Record<string, unknown> | null
        afterData: Record<string, unknown> | null
    }[]
}
export interface ManagementSource {
    sourceType: SourceType
    sourceId: number
    projectId: number
    teamId: number | null
    name: string
    owners: { id: number; name: string }[]
}
export interface ManagementCandidates {
    projects: { id: number; name: string }[]
    teams: { projectId: number; id: number; name: string }[]
    sources: ManagementSource[]
}
export const followupStatus = { OPEN: '待处理', IN_PROGRESS: '处理中', COMPLETED: '已完成' }
export const followupAction = {
    CREATE: '建立问题',
    UPDATE: '调整安排',
    START: '开始处理',
    NOTE: '追加进展',
    COMPLETE: '完成处理',
    REOPEN: '重新打开',
}
export const reportLabels: Record<ReportKind, string> = {
    progress: '项目进度',
    tasks: '任务执行',
    approvals: '审批时效',
    resources: '资源合作',
}
export function emptyFollowup(): FollowupInput {
    return {
        projectId: 0,
        teamId: null,
        sourceType: 'PROJECT',
        sourceId: 0,
        title: '',
        description: '',
        ownerId: 0,
        dueDate: '',
        requestKey: crypto.randomUUID(),
    }
}
