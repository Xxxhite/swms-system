import { http } from '@/api/request'
import type { PageResult } from '@/api/types'
import {
    queryParams,
    type BusinessQuery,
    type ApprovalTask,
    type ApprovalInstance,
} from '@/api/business-types'
/** 审批接口只发送当前任务版本及意见，实际审批人由服务端确认。 */
export const approvalApi = {
    tasks: (q: BusinessQuery): Promise<PageResult<ApprovalTask>> =>
        http.get('/approvals/tasks', queryParams(q)),
    detail: (id: number): Promise<ApprovalInstance> => http.get(`/approvals/instances/${id}`),
    decide: (t: ApprovalTask, approved: boolean, comment: string) =>
        http.post(`/approvals/tasks/${t.id}/${approved ? 'approve' : 'reject'}`, {
            version: t.version,
            comment,
        }),
}
