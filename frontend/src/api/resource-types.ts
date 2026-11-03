export interface ResourceInput {
    name: string
    unitType: string
    region: string
    ownerOrgId: number
    maintainerId: number
    creditCode?: string
    address?: string
    description?: string
    source?: string
    capabilityCodes?: string[]
    serviceFieldCodes?: string[]
    intention?: string
    requestKey?: string
}
export interface Resource extends Omit<ResourceInput, 'creditCode'> {
    id: number
    creditCode: string | null
    status: 'ACTIVE' | 'ARCHIVED' | 'MERGED'
    mergedIntoId: number | null
    version: number
    createdAt: string
    relationship: 'POTENTIAL' | 'CURRENT' | 'HISTORICAL'
    overdue?: number
    maintainerName?: string
    ownerOrgName?: string
}
export interface ResourceCandidates {
    serviceFields?: Array<{ code: string; name: string }>
    resources: Array<{ id: number; name: string; region: string }>
    organizations: Array<{ id: number; name: string }>
    users: Array<{ id: number; name: string; orgId: number | null }>
}
export interface ResourceContact {
    id: number
    resourceId: number
    name: string
    position: string
    phone: string
    email: string
    note: string
    isPrimary: number
    status: 'ACTIVE' | 'ARCHIVED'
    version: number
}
export interface ResourceCooperation {
    id: number
    resourceId: number
    title: string
    type: 'MANUAL' | 'CONTRACT'
    projectId: number | null
    ownerId: number
    status: string
    startDate: string | null
    endDate: string | null
    basis: string
    result: string
    feedback: string
    version: number
}
export interface ResourceFollowup {
    id: number
    resourceId: number
    cooperationId: number | null
    contactId: number | null
    occurredAt: string
    method: string
    content: string
    result: string
    nextAction: string
    nextOwnerId: number | null
    nextDueDate: string | null
    completed: number
    version: number
}
export interface ResourceDetail extends Resource {
    canViewContacts: boolean
    events: Array<{ id: number; action: string; actorName: string; createdAt: string }>
    contacts: ResourceContact[]
    cooperations: ResourceCooperation[]
    followups: ResourceFollowup[]
    contracts: Array<{
        id: number
        projectId: number
        projectName: string
        partnerName: string
        contractNo: string | null
        startDate: string
        endDate: string
    }>
    merges: Array<{
        id: number
        sourceId: number
        targetId: number
        reason: string
        createdAt: string
    }>
}
export interface LegacyContract {
    id: number
    projectId: number
    projectName: string
    partnerName: string
    projectVersion: number
}
export const resourceStatus: Record<string, string> = {
    ACTIVE: '使用中',
    ARCHIVED: '已归档',
    MERGED: '已合并',
}
export const resourceRelationship: Record<string, string> = {
    POTENTIAL: '尚未合作',
    CURRENT: '正在合作',
    HISTORICAL: '历史合作',
}
export const cooperationStatus: Record<string, string> = {
    TO_CONTACT: '待联系',
    CONTACTING: '接洽中',
    NEGOTIATING: '方案沟通',
    TO_SIGN: '待签约',
    AGREED: '已达成',
    ENDED: '已结束',
    TERMINATED: '已终止',
}
export const emptyResource = (): ResourceInput => ({
    name: '',
    unitType: '',
    region: '',
    ownerOrgId: 0,
    maintainerId: 0,
    creditCode: '',
    address: '',
    description: '',
    source: '',
    capabilityCodes: [],
    serviceFieldCodes: [],
    intention: '',
})
