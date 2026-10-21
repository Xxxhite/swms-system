import { describe, expect, test } from 'bun:test'
import { formatDateTime } from '../src/utils/dateTime'

describe('业务时间显示', () => {
    test('UTC 转换为北京时间并去除毫秒及 ISO 分隔符', () => {
        expect(formatDateTime('2026-10-21T06:21:35.088Z')).toBe('2026-10-21 14:21:35')
    })

    test('跨日及午夜使用 24 小时制', () => {
        expect(formatDateTime('2026-10-21T16:00:00Z')).toBe('2026-10-22 00:00:00')
        expect(formatDateTime('2026-12-31T23:59:59Z')).toBe('2027-01-01 07:59:59')
    })

    test('显式时区偏移与 Date 输入按同一时刻转换', () => {
        expect(formatDateTime('2026-10-21T14:21:35+08:00')).toBe('2026-10-21 14:21:35')
        expect(formatDateTime(new Date('2026-10-21T06:21:35Z'))).toBe('2026-10-21 14:21:35')
    })

    test('缺少偏移的接口时间按 UTC 解释，不依赖浏览器所在时区', () => {
        expect(formatDateTime('2026-10-21T06:21:35')).toBe('2026-10-21 14:21:35')
    })

    test('空值及无效时间显示占位符', () => {
        for (const value of [null, undefined, '', '  ', 'invalid', new Date(NaN)]) {
            expect(formatDateTime(value)).toBe('—')
        }
    })
})
