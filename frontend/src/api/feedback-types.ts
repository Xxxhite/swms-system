import type { PageResult } from './types'
export type QualityKind = 'service' | 'cooperation'
export type FeedbackSource = 'PAPER' | 'ORAL' | 'PHONE' | 'OTHER'
export type FeedbackRating = 'SATISFIED' | 'GENERAL' | 'NEEDS_IMPROVEMENT'
export const feedbackSources: Record<FeedbackSource, string> = {
    PAPER: '纸质汇总',
    ORAL: '口头反馈',
    PHONE: '电话回访',
    OTHER: '其他',
}
export const feedbackRatings: Record<FeedbackRating, string> = {
    SATISFIED: '满意',
    GENERAL: '一般',
    NEEDS_IMPROVEMENT: '待改进',
}
export interface FeedbackInput {
    version: number
    requestKey: string
    reason?: string
    satisfiedCount: number
    neutralCount: number
    dissatisfiedCount: number
    source: FeedbackSource
    sourceNote: string
    feedbackDate: string
    suggestions: string
}
export interface Feedback extends Omit<FeedbackInput, 'requestKey' | 'reason'> {
    id: number
    taskId: number
    status: 'ACTIVE' | 'VOID'
    voidReason: string
}
export interface QualityHistory {
    id: number
    action: string
    actorName: string
    createdAt: string
    reason: string
    value?: unknown
}
export interface QualityFollowup {
    id: number
    title: string
    status: string
    result: string
}
export interface FeedbackDetail {
    task: { id: number; title: string; projectId: number; teamId: number; form: string }
    feedback: Feedback | null
    canEdit: boolean
    applicable: boolean
    endedAt: string | null
    summary: string
    history: QualityHistory[]
    followups: QualityFollowup[]
    canManage: boolean
    related: {
        taskId: number
        title: string
        date: string
        suggestions: string
        dissatisfiedCount: number
        followups: QualityFollowup[]
    }[]
}
export interface EvaluationInput {
    version: number
    requestKey: string
    reason?: string
    feedbackRating: FeedbackRating
    result: string
    feedback: string
}
export interface EvaluationDetail {
    cooperation: {
        id: number
        title: string
        version: number
        feedbackRating: FeedbackRating | null
        feedbackBy: number | null
        feedbackAt: string | null
        result: string
        feedback: string
    }
    canEdit: boolean
    history: QualityHistory[]
}
export interface QualityRow {
    id: number
    title: string
    projectName: string
    teamName: string
    date: string
    status: string
    samples: number
    satisfied: number
    neutral: number
    dissatisfied: number
    suggestions: string
    href: string
    version: number
}
export interface QualityReport extends PageResult<QualityRow> {
    kind: QualityKind
    title: string
    summary: {
        total: number
        evaluated: number
        coverage: string | null
        samples: number
        satisfied: number
        neutral: number
        dissatisfied: number
        satisfaction: string | null
    }
    meta: {
        filters: Record<string, string | number>
        fingerprint: string
        generatedAt: string
        basis: string
    }
}
export const emptyFeedback = (): FeedbackInput => ({
    version: 0,
    requestKey: crypto.randomUUID(),
    satisfiedCount: 0,
    neutralCount: 0,
    dissatisfiedCount: 0,
    source: 'PAPER',
    sourceNote: '',
    feedbackDate: '',
    suggestions: '',
    reason: '',
})
/** 同内容保留请求标识供网络失败重试；内容变化才生成新标识。 */
export function qualityRequest(previous: { content: string; key: string }, input: object) {
    const content = JSON.stringify(input)
    if (previous.content !== content) {
        previous.content = content
        previous.key = crypto.randomUUID()
    }
    return previous.key
}
