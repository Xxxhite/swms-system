import { useUserStore } from '@/stores/user'
import type {
    Feedback,
    FeedbackDetail,
    FeedbackInput,
    QualityKind,
    QualityReport,
} from '@/api/feedback-types'
const records = new Map<number, Feedback>()
export const mockFeedback = {
    async detail(id: number): Promise<FeedbackDetail> {
        const store = useUserStore()
        return {
            task: { id, title: '演示集体服务', projectId: 1, teamId: 1, form: 'COLLECTIVE' },
            feedback: records.get(id) ?? null,
            canEdit: store.profile?.username === 'social',
            applicable: true,
            endedAt: new Date().toISOString(),
            summary: '演示服务总结',
            history: [],
            followups: [],
            canManage: false,
            related: [],
        }
    },
    async save(id: number, input: FeedbackInput) {
        records.set(id, {
            ...input,
            id,
            taskId: id,
            status: 'ACTIVE',
            voidReason: '',
            version: input.version + 1,
        })
        return { id, version: input.version + 1 }
    },
    async void(id: number, input: { version: number; reason: string }) {
        const row = records.get(id)
        if (row) {
            row.status = 'VOID'
            row.voidReason = input.reason
            row.version++
        }
        return { id, version: input.version + 1 }
    },
    async report(kind: QualityKind, q: Record<string, unknown>): Promise<QualityReport> {
        return {
            kind,
            title: kind === 'service' ? '服务质量反馈' : '合作评价',
            list: [],
            total: 0,
            page: Number(q.page ?? 1),
            pageSize: Number(q.pageSize ?? 20),
            summary: {
                total: 0,
                evaluated: 0,
                coverage: null,
                samples: 0,
                satisfied: 0,
                neutral: 0,
                dissatisfied: 0,
                satisfaction: null,
            },
            meta: {
                filters: {},
                fingerprint: 'demo',
                generatedAt: new Date().toISOString(),
                basis: '演示数据；真实业务按授权范围统计。',
            },
        }
    },
}
