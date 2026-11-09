import { http } from '@/api/request'
import { useMock } from '@/api/config'
import { mockFeedback } from '@/mock/feedback'
import type { FeedbackDetail, FeedbackInput } from '@/api/feedback-types'
export const feedbackApi = {
    detail: (id: number): Promise<FeedbackDetail> =>
        useMock ? mockFeedback.detail(id) : http.get(`/service/tasks/${id}/feedback`),
    save: (id: number, input: FeedbackInput): Promise<{ id: number; version: number }> =>
        useMock ? mockFeedback.save(id, input) : http.put(`/service/tasks/${id}/feedback`, input),
    void: (
        id: number,
        input: { version: number; requestKey: string; reason: string },
    ): Promise<{ id: number; version: number }> =>
        useMock
            ? mockFeedback.void(id, input)
            : http.post(`/service/tasks/${id}/feedback/void`, input),
}
