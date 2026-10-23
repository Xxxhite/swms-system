import { describe, expect, test } from 'bun:test'
import { dateIssue, decimalIssue, monthIssue, textIssue } from '../src/utils/businessValidation'

describe('业务表单字段校验', () => {
    test('拒绝空白文本和超长输入', () => {
        expect(textIssue('  ', '名称', 3)).toBe('请填写名称')
        expect(textIssue('四个文字', '名称', 3)).toContain('最多 3')
        expect(textIssue('名称', '名称', 3)).toBeUndefined()
    })
    test('数量支持零，目标必须为正数，精度和上限与服务端一致', () => {
        for (const invalid of ['', '-1', '1e2', '01', '0.001', '10000000000', null])
            expect(decimalIssue(invalid, '数量')).toBeDefined()
        expect(decimalIssue('0.00', '数量')).toBeUndefined()
        expect(decimalIssue('0.00', '目标', true)).toBe('目标须大于零')
        expect(decimalIssue('0.01', '目标', true)).toBeUndefined()
        expect(decimalIssue('9999999999.99', '数量')).toBeUndefined()
        expect(decimalIssue('999999999999.99', '金额', false, 12)).toBeUndefined()
    })
    test('真实日期、闰年、月份与未来月份校验', () => {
        expect(dateIssue('2024-02-29', '日期')).toBeUndefined()
        for (const value of ['2025-02-29', '2026-04-31', '2026-13-01', '', null])
            expect(dateIssue(value, '日期')).toBeDefined()
        expect(monthIssue('2026-10', '2026-10')).toBeUndefined()
        expect(monthIssue('2025-12', '2026-10')).toBeUndefined()
        expect(monthIssue('2026-11', '2026-10')).toContain('不能晚于')
        expect(monthIssue('2026-13', '2026-10')).toContain('有效')
    })
})
