import { describe, expect, test } from 'bun:test'
import { registrationIssue } from '../src/views/register/fields'

describe('注册与申请资料校验', () => {
    test('短密码、超长密码和非法账号均提供具体中文提示', () => {
        expect(registrationIssue('password', '123456')).toBe('密码须为 8—128 字符')
        expect(registrationIssue('password', 'a'.repeat(129))).toBeDefined()
        expect(registrationIssue('password', 'a'.repeat(8))).toBeUndefined()
        expect(registrationIssue('password', 'a'.repeat(128))).toBeUndefined()
        expect(registrationIssue('username', 'Bad!')).toContain('账号')
        expect(registrationIssue('username', 'test_123')).toBeUndefined()
    })
    test('纯空格与超长资料在提交前拦截', () => {
        expect(registrationIssue('name', '   ')).toBe('请填写姓名')
        expect(registrationIssue('phone', '')).toBe('请填写联系电话')
        expect(registrationIssue('name', '名'.repeat(51))).toContain('50')
        expect(registrationIssue('major', '专'.repeat(101))).toContain('100')
        expect(registrationIssue('name', '测试社工')).toBeUndefined()
    })
    test('日期拒绝自动进位并正确处理闰年', () => {
        for (const date of ['2026-02-30', '2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01'])
            expect(registrationIssue('arrivalDate', date)).toBeDefined()
        expect(registrationIssue('arrivalDate', '2024-02-29')).toBeUndefined()
        expect(registrationIssue('arrivalDate', '2026-10-21')).toBeUndefined()
    })
})
