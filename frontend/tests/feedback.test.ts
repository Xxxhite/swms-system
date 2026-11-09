import { describe, test, expect } from 'bun:test'
import { qualityRequest, emptyFeedback } from '../src/api/feedback-types'
describe('质量反馈请求重试', () => {
    test('原内容沿用标识，修改表单后使用新标识', () => {
        const state = { content: '', key: '' },
            form = emptyFeedback()
        const first = qualityRequest(state, { ...form, requestKey: undefined })
        expect(qualityRequest(state, { ...form, requestKey: undefined })).toBe(first)
        expect(
            qualityRequest(state, { ...form, requestKey: undefined, satisfiedCount: 8 }),
        ).not.toBe(first)
    })
})
