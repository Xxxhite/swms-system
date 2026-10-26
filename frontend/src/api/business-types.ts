import type { SortQuery } from '@/utils/tableSort'

export interface BusinessQuery extends SortQuery {
    page?: number
    pageSize?: number
    keyword?: string
    category?: string
    status?: string
    serviceFieldCode?: string
    serviceArea?: string
    teamId?: number
    projectId?: number
    indicatorId?: number
    month?: string
    asOfDate?: string
    warningLevel?: string
}
export interface ProjectInput {
    code: string
    name: string
    category: 'CONTRACT_PACKAGE'
    ownerOrgId: number
    directorId: number
    seniorDirectorId: number
    supervisorId: number | null
    subFieldCodes?: string[]
    brandCodes?: string[]
    serviceFieldCode: string
}
export interface ProjectMember {
    userId: number
    teamId: number
    startDate: string
    endDate: string
    name?: string
    teamName?: string
}
export interface ContractFile {
    id: number
    name: string
    size: number
    contentType: string
    createdAt: string
}
export interface ContractInput {
    contractNo?: string
    partnerName: string
    startDate: string
    endDate: string
    amount: string
    serviceArea: string
    note?: string
}
export interface Allocation {
    teamId: number
    targetValue: string
}
export interface Indicator {
    createdAt: string
    id: number
    projectId: number
    name: string
    unit: string
    definition: string
    targetValue?: string
    status: 'DRAFT' | 'ACTIVE'
    version: number
    allocations: Allocation[]
}
export interface Project extends ProjectInput {
    ownerOrgName: string | null
    directorName: string | null
    seniorDirectorName: string | null
    canManage: boolean
    members: ProjectMember[]
    supervisorName: string | null
    createdAt: string
    id: number
    status: 'DRAFT' | 'ACTIVE'
    version: number
    statisticsScope: 'PROJECT' | 'TEAM'
    visibleTeamIds: number[]
    contract: ContractInput | null
    teams: Array<{ teamId: number; reporterId: number; teamName: string; reporterName: string }>
    servicePoints: Array<{ id?: number; name: string; address?: string; note?: string }>
    indicators: Indicator[]
}
export interface Candidates {
    projects?: Array<{ id: number; name: string }>
    organizations: Array<{ id: number; name: string; type: string }>
    users: Array<{
        id: number
        name: string
        username: string
        teamId: number | null
        positionCode?: string | null
        isSupervisor?: boolean
    }>
    subFields?: Array<{ code: string; name: string }>
    brands?: Array<{ code: string; name: string }>
    serviceAreas?: string[]
    serviceFields: Array<{ code: string; name: string }>
}
export interface MonthlyInput {
    indicatorId: number
    teamId: number
    month?: string
    serviceDate: string
    requestKey?: string
    actualValue: string
    note?: string
}
export interface ApprovalInstance {
    id: number
    applicantId: number
    status: string
    businessSnapshot: Record<string, unknown>
    workflowSnapshot: unknown
    tasks?: ApprovalTask[]
    records?: Array<{
        id: number
        action: string
        comment: string | null
        createdAt: string
        actorId: number
        actorName?: string
    }>
}
export interface ApprovalTask {
    createdAt: string
    id: number
    instanceId: number
    approverId: number
    canDecide?: boolean
    status: string
    version: number
    instance?: ApprovalInstance
}
export interface Monthly extends Omit<MonthlyInput, 'serviceDate'> {
    serviceDate: string | null
    createdAt: string
    legacyReportId?: number | null
    submissions?: ApprovalInstance[]
    canMaintain: boolean
    /** 当前成员归属有效或具备项目管理关系，可提交 */
    canSubmit: boolean
    /** 当前成员归属有效或具备项目管理关系，可申请变更 */
    canChange: boolean
    id: number
    status: 'DRAFT' | 'IN_REVIEW' | 'REJECTED' | 'SUBMITTED' | 'VOID'
    version: number
    submittedAt: string | null
    projectId: number
    projectName: string
    indicatorName: string
    teamName: string
    unit: string
    changes: Array<{
        id: number
        operation: string
        reason: string
        pendingReportId: number | null
        instance: ApprovalInstance
    }>
}
export interface Progress {
    canReport?: boolean
    projectId: number
    projectName: string
    indicatorId: number
    indicatorName: string
    unit: string
    definition: string
    teamId: number | null
    teamName: string
    statisticsScope: 'PROJECT' | 'TEAM' | 'SELF'
    targetValue: string
    monthlyValue: string
    cumulative: string
    completionRate: number | null
    warningLevel: 'green' | 'yellow' | 'orange' | 'red' | null
    overdue: boolean
    notStarted: boolean
    endDate: string
    asOfDate: string
    month: string
    calculationNote: string
}
/** 移除空筛选项；数字零仍保留，避免把清空条件发送为字符串空值。 */
export function queryParams(query: BusinessQuery): Record<string, unknown> {
    return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v != null))
}
export const projectCategories = {
    CONTRACT_PACKAGE: '合同包',
}
export const businessStatus: Record<string, string> = {
    DRAFT: '草稿',
    ACTIVE: '已启用',
    SUBMITTED: '已通过',
    VOID: '已撤销',
    PENDING: '待审批',
    IN_REVIEW: '审批中',
    APPROVED: '已通过',
    REJECTED: '已驳回',
    CANCELLED: '已撤回',
    CORRECT: '更正',
    DELETE: '撤销',
    RESTORE: '恢复',
    SUBMIT: '提交',
    APPROVE: '通过',
    REJECT: '驳回',
    WITHDRAW: '撤回',
}
