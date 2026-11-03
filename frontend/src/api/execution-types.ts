export interface GeoSample {
    status: 'OK' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED'
    latitude?: number
    longitude?: number
    accuracy?: number
    sampledAt?: string
}
export interface ExecutionPolicy {
    latitude: number | null
    longitude: number | null
    radius: number
    accuracyLimit: number
    beforeMinutes: number
    afterMinutes: number
    toleranceMinutes: number
    credentialMinutes: number
    supplementHours: number
    pointId: number | null
    pointVersion: number | null
}
export interface Evidence {
    id: number
    taskId: number
    name: string
    size: number
    contentType: string
    uploadedBy: number
    sha256: string
    boundKind: 'STAFF' | 'PARTICIPATION' | 'EXCEPTION' | null
    boundId: number | null
    createdAt: string
}
export interface StaffEvent {
    id: number
    userId: number
    userName: string
    kind: 'CHECK_IN' | 'CHECK_OUT'
    method: 'NORMAL' | 'SUPPLEMENT' | 'CORRECTION'
    occurredAt: string
    declaredAt: string
    receivedAt: string
    reason: string
    geo: GeoSample | null
    distance: number | null
    flags: string[]
    current: boolean
}
export interface Participant {
    id: number
    projectId: number
    code: string
    name: string
    phone?: string
    status: 'ACTIVE' | 'ARCHIVED'
    version: number
}
export interface Roster {
    id: number
    taskId: number
    participantId: number
    person: Pick<Participant, 'id' | 'code' | 'name' | 'phone' | 'status'>
    participation: {
        id: number
        currentEventId: number
        status: 'RECORDED' | 'VOID'
        requiresReview: number
        version: number
    } | null
}
export interface ParticipationEvent {
    id: number
    rosterId: number
    kind: 'CONFIRM' | 'CORRECT' | 'VOID'
    method: 'SELF' | 'FAMILY' | 'ASSISTED' | 'SUPPLEMENT'
    confirmerRole: string
    relation: string
    reason: string
    occurredAt: string
    receivedAt: string
    flags: string[]
}
export interface ExecutionException {
    id: number
    taskId: number
    code: string
    label: string
    ownerId: number
    reviewerId: number | null
    status: 'OPEN' | 'EXPLAINED' | 'RESOLVED'
    version: number
    notes: Array<{ actorId: number; reason: string; createdAt: string; evidenceIds: number[] }>
    title?: string
    ownerName?: string
    reviewerName?: string
    evidence?: Array<{ id: number; name: string }>
    source?: {
        kind: string
        occurredAt: string
        receivedAt: string
        geo: GeoSample
        distance: number | null
        reason: string
    } | null
}
export interface FieldTask {
    id: number
    title: string
    projectId: number
    projectName?: string
    teamId: number
    form: string
    location: string
    startAt: string
    endAt: string
    leaderId: number
    state: string
}
export interface ExecutionDetail {
    task: FieldTask
    taskId: number
    taskVersion: number
    policy: ExecutionPolicy
    policyVersion: number
    policyStale: boolean
    session: {
        id: number
        status: 'IN_PROGRESS' | 'ENDED' | 'STOPPED'
        startedAt: string
        endedAt: string | null
        sourceVersion: number
    } | null
    sourceVersion: number
    state: string
    summary: { registered: number; requiresReview: number; openExceptions: number }
    attendance: StaffEvent[]
    rosters: Roster[]
    participationEvents: ParticipationEvent[]
    exceptions: ExecutionException[]
    canRecord: boolean
    canConfigure: boolean
    canStart: boolean
    canCheckIn: boolean
    canCheckOut: boolean
    canEnd: boolean
    canStop: boolean
    canManageParticipants: boolean
    canIssue: boolean
    canSupplement: boolean
}
export interface AttendancePayload {
    requestKey: string
    sourceVersion: number
    kind: 'CHECK_IN' | 'CHECK_OUT'
    method: 'NORMAL' | 'SUPPLEMENT' | 'CORRECTION'
    declaredAt: string
    geo: GeoSample
    reason: string
    supersedesId?: number
    evidenceIds: number[]
}
export interface LifecyclePayload {
    requestKey: string
    sourceVersion: number
    declaredAt: string
    geo: GeoSample
    reason: string
    evidenceIds: number[]
}
export interface ParticipationPayload {
    requestKey: string
    sourceVersion: number
    kind: 'CONFIRM' | 'CORRECT' | 'VOID'
    method: 'ASSISTED' | 'SUPPLEMENT'
    confirmerRole: 'SELF' | 'FAMILY' | 'COMPANION' | 'STAFF'
    relation: string
    reason: string
    occurredAt: string
    evidenceIds: number[]
}
export interface ParticipationPage {
    title: string
    date: string
    name: string
    purpose: 'COLLECTIVE' | 'HOME_CONFIRM'
    expiresAt: string
    recorded: boolean
    canConfirm: boolean
}
export const executionFlags: Record<string, string> = {
    LOCATION_DENIED: '定位授权被拒绝',
    LOCATION_UNAVAILABLE: '定位不可用',
    LOCATION_TIMEOUT: '定位超时',
    LOCATION_UNSUPPORTED: '设备未提供定位',
    LOCATION_STALE: '定位采样过旧',
    LOW_ACCURACY: '定位精度不足',
    OUTSIDE_RANGE: '偏离服务范围',
    NO_REFERENCE_POINT: '未设参考点',
    CLOCK_SKEW: '设备时间偏移',
    LATE: '迟到',
    EARLY: '早退',
    MISSING_CHECKOUT: '缺少离岗记录',
    SUPPLEMENT: '补录待核验',
    CORRECTION: '更正待核验',
    ASSISTED: '辅助确认待核验',
    VOID: '参与作废待核验',
}
