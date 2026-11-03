export const taskForms: Record<string, string> = {
    COLLECTIVE: '集体服务',
    HOME_VISIT: '入户探访',
    STATIONED: '驻点服务',
}
export const taskStatuses: Record<string, string> = {
    SCHEDULED: '待开展',
    CANCELED: '已取消',
    IN_PROGRESS: '进行中',
    TO_ORGANIZE: '待整理',
    IN_REVIEW: '待审批',
    COMPLETED: '已完成',
}
export interface TaskInput {
    projectId: number
    teamId: number
    title: string
    form: 'COLLECTIVE' | 'HOME_VISIT' | 'STATIONED'
    kind: 'INDICATOR' | 'OTHER'
    pointId: number | null
    location: string
    address: string
    startAt: string
    endAt: string
    leaderId: number
    staffIds: number[]
    expectedPeople: number
    description: string
    evidence: string
    indicators: Array<{ indicatorId: number; plannedValue: string }>
    resources: Array<{ resourceId: number; contactId: number | null; collaboration: string }>
}
export interface Recurrence {
    frequency: 'DAILY' | 'WEEKLY'
    until: string
    weekdays: number[]
}
export interface Task extends Omit<TaskInput, 'resources'> {
    id: number
    version: number
    status: 'SCHEDULED' | 'CANCELED'
    state: string
    projectName: string
    teamName: string
    leaderName: string
    canUpdate: boolean
    canCancel: boolean
    executable: boolean
    overdue: boolean
    needsRearrangement: boolean
    sourceTaskId: number | null
    staff: Array<{ userId: number; name: string }>
    indicators: Array<{
        indicatorId: number
        plannedValue: string
        indicatorName: string
        unit: string
        planId: number
        periodId: number
    }>
    resources: Array<{
        id: number
        resourceId: number | null
        contactId: number | null
        resourceName: string
        collaboration: string
        needsReview: boolean
        contact: { name: string; phone: string; email: string; status: string } | null
    }>
    events?: Array<{
        id: number
        action: string
        reason: string
        actorName: string
        createdAt: string
        beforeData: unknown
        afterData: unknown
    }>
}
export interface Period {
    id?: number
    startDate: string
    endDate: string
    targetValue: string
}
export interface PlanInput {
    targetId: number
    mode: 'MONTHLY' | 'MILESTONE'
    effectiveDate: string
    reason: string
    periods?: Period[]
}
export interface Plan extends PlanInput {
    id: number
    version: number
    revision: number
    projectId: number
    teamId: number
    indicatorId: number
    indicatorName: string
    unit: string
    projectName: string
    teamName: string
    status: 'DRAFT' | 'PUBLISHED'
    targetValue: string
    targetVersion: number
    indicatorVersion: number
    stale: boolean
    canManage: boolean
    publishedAt: string | null
    periods: Period[]
}
export interface TaskCandidates {
    projects: Array<{ id: number; name: string; status: string }>
    teams: Array<{ projectId: number; teamId: number; name: string }>
    staff: Array<{ id: number; name: string }>
    leaders: Array<{ id: number; name: string }>
    targets: Array<{
        id: number
        indicatorId: number
        projectId: number
        teamId: number
        name: string
        unit: string
        targetValue: string
        plan: { id: number; status: string } | null
        contract: { startDate: string; endDate: string }
    }>
    points: Array<{ id: number; projectId: number; name: string; address: string | null }>
    resources: Array<{ id: number; name: string; contacts: Array<{ id: number; name: string }> }>
}
export interface TaskPreview {
    instances: Array<{ startAt: string; endAt: string }>
    previewToken: string
    warnings: string[]
    conflicts: Array<{
        instance: number
        taskId: number | null
        title: string
        staffNames: string[]
        startAt: string | null
        endAt: string | null
    }>
}
export function emptyTask(): TaskInput {
    return {
        projectId: 0,
        teamId: 0,
        title: '',
        form: 'COLLECTIVE',
        kind: 'INDICATOR',
        pointId: null,
        location: '',
        address: '',
        startAt: '',
        endAt: '',
        leaderId: 0,
        staffIds: [],
        expectedPeople: 0,
        description: '',
        evidence: '',
        indicators: [],
        resources: [],
    }
}
export function emptyCandidates(): TaskCandidates {
    return {
        projects: [],
        teams: [],
        staff: [],
        leaders: [],
        targets: [],
        points: [],
        resources: [],
    }
}
/** 所有任务编辑时间均按业务时区解释，与浏览器所在时区无关。 */
export function toBusinessInput(value: string): string {
    return new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 19)
}
export function taskPayload(value: TaskInput): TaskInput {
    return {
        ...value,
        startAt: /Z$|[+-]\d{2}:\d{2}$/.test(value.startAt)
            ? value.startAt
            : value.startAt + '+08:00',
        endAt: /Z$|[+-]\d{2}:\d{2}$/.test(value.endAt) ? value.endAt : value.endAt + '+08:00',
    }
}
export function businessDay(value = new Date()): string {
    return new Date(value.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}
export function splitAmount(value: string, count: number): string[] {
    const [whole, part = ''] = value.split('.')
    const total = BigInt(whole!) * 100n + BigInt(part.padEnd(2, '0')),
        each = total / BigInt(count)
    return Array.from({ length: count }, (_, i) => {
        const n = i === count - 1 ? total - each * BigInt(i) : each
        return `${n / 100n}.${(n % 100n).toString().padStart(2, '0')}`
    })
}
