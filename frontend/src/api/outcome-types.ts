export type CalculationMode = 'MANUAL' | 'SCENES' | 'VISITS' | 'PEOPLE' | 'STAFF_HOURS'
export const calculationLabels: Record<CalculationMode, string> = {
    MANUAL: '人工申报',
    SCENES: '场次',
    VISITS: '服务人次',
    PEOPLE: '去重服务人数',
    STAFF_HOURS: '工作人员服务小时',
}
export interface OutcomeDecision {
    key: string
    decision: 'ACCEPT' | 'EXCLUDE'
    reason: string
}
export interface OutcomeSource {
    taskId: number
    title: string
    projectId: number
    teamId: number
    date: string
    sourceVersion: number
    state: 'ENDED' | 'STOPPED'
    summary: string
    startedAt: string
    endedAt: string
    staff: Array<{
        id: number
        name: string
        startAt: string | null
        endAt: string | null
        flags: string[]
        location: string
    }>
    participants: Array<{
        id: number
        name: string
        rosterId: number
        eventId: number
        occurredAt: string
        method: string
        status: string
        flags: string[]
    }>
    evidence: Array<{ id: number; name: string; sha256: string; contentType: string; size: number }>
    issues: Array<{
        key: string
        label: string
        target: string
        targetId: number
        reason: string
        notes: Array<{ reason: string; createdAt: string; evidenceIds: number[] }>
    }>
    rules: Array<{
        indicatorId: number
        indicatorName: string
        unit: string
        mode: CalculationMode
        ruleId: number | null
        ruleVersion: number
        manualValue: string
        plannedValue: string
    }>
}
export interface OutcomeRecord {
    pendingChange?: { id: number; applicantId: number } | null
    id: number
    taskId: number
    recordId: number
    indicatorId: number
    draftSnapshotId: number | null
    record: {
        id: number
        version: number
        status: string
        actualValue: string
        submittedAt: string | null
    }
    effectiveReview: { id: number; value: string; mode: CalculationMode; snapshotId: number } | null
}
export interface OutcomeDetail {
    outcome: {
        id: number
        taskId: number
        summary: string
        version: number
        summaryStatus: string
        effectiveSummarySnapshotId: number | null
    } | null
    sourceVersion: number
    source?: OutcomeSource | null
    sourceStale?: boolean
    canMaintain?: boolean
    records: OutcomeRecord[]
    snapshots: Array<{ id: number; sourceVersion: number; createdAt: string }>
    summarySubmissions?: Array<{ id: number; status: string; applicantId: number }>
}
export interface OutcomeReviewInput {
    version: number
    decisions: OutcomeDecision[]
    comment?: string
    previewToken?: string
}
export interface OutcomePreview {
    value: string
    declaredValue: string
    difference: boolean
    previewToken: string
    source: OutcomeSource
}
export interface CalculationRule {
    id: number
    mode: CalculationMode
    revision: number
    effectiveDate: string
    reason: string
}
