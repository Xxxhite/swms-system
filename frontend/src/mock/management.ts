import { getToken } from '@/utils/auth'
import { mockProfile } from './auth'
import type { CurrentUser } from '@/api/types'
import type {
    ReportKind,
    ManagementQuery,
    ManagementReport,
    DashboardOverview,
    Followup,
} from '@/api/management-types'
import { reportLabels } from '@/api/management-types'
function actor() {
    const result = mockProfile({ headers: { Authorization: `Bearer ${getToken()}` } })
    if (result.code !== 0) throw new Error('请先登录')
    return result.data as CurrentUser
}
export async function mockReport(kind: ReportKind, q: ManagementQuery): Promise<ManagementReport> {
    const user = actor()
    if (!user.permissions.includes('analysis:report:view')) throw new Error('没有分析权限')
    const now = new Date().toISOString()
    return {
        kind,
        title: reportLabels[kind],
        columns: [
            { key: 'title', label: '事项' },
            { key: 'status', label: '状态' },
        ],
        list: [],
        total: 0,
        page: Number(q.page ?? 1),
        pageSize: Number(q.pageSize ?? 20),
        groups: [],
        averages: [],
        meta: {
            filters: q,
            generatedAt: now,
            referenceTime: now,
            fingerprint: '0'.repeat(64),
            basis: '演示环境：暂无授权分析记录。',
            version: 'mock-b5',
            total: 0,
        },
    }
}
export async function mockDashboard(): Promise<DashboardOverview> {
    const user = actor(),
        has = (p: string) => user.permissions.includes(p)
    const groups = [
        ['tasks', '我的执行任务', 'activity:view'],
        ['approvals', '我的待审批', 'service:monthly:approve'],
        ['resources', '我的资源跟进', 'resource:view'],
        ['management', '我的管理问题', 'management:followup:view'],
    ]
        .filter(([, , p]) => has(p!))
        .map(([key, title]) => ({ key: key!, title: title!, total: 0, list: [] }))
    return { groups, events: [], generatedAt: new Date().toISOString() }
}
export const mockManagement = {
    async list(q: ManagementQuery) {
        actor()
        return {
            list: [] as Followup[],
            total: 0,
            page: Number(q.page ?? 1),
            pageSize: Number(q.pageSize ?? 20),
        }
    },
    async candidates() {
        actor()
        return { projects: [], teams: [], sources: [] }
    },
    async detail(_id: number): Promise<Followup> {
        void _id
        throw new Error('演示环境暂无该管理问题')
    },
    async create(): Promise<{ id: number }> {
        throw new Error('请在真实业务环境建立管理问题')
    },
    async transition(_id: number, _input: unknown): Promise<{ id: number }> {
        void _id
        void _input
        throw new Error('演示环境暂无可处理问题')
    },
}
