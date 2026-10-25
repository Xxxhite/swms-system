import { describe, expect, test } from 'bun:test'
import {
    AxiosError,
    CanceledError,
    type AxiosAdapter,
    type InternalAxiosRequestConfig,
} from 'axios'

import { createApiClient, createHttp } from '../src/api/client'

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200) {
    return { config, data, status, statusText: '', headers: {} }
}

function fixture(adapter: AxiosAdapter) {
    let token = 'test-token'
    let expired = 0
    const messages: string[] = []
    const client = createApiClient({
        baseURL: '/api',
        adapter,
        getToken: () => token,
        onUnauthorized: () => {
            token = ''
            expired += 1
        },
        onError: (message) => {
            messages.push(message)
        },
    })
    return {
        client,
        http: createHttp(client),
        messages,
        expired: () => expired,
        token: () => token,
    }
}

describe('请求与错误契约', () => {
    test('附加鉴权头并拆掉成功响应信封', async () => {
        const { http, messages } = fixture(async (config) => {
            expect(config.headers.Authorization).toBe('Bearer test-token')
            expect(config.baseURL).toBe('/api')
            return response(config, { code: 0, message: 'ok', data: { id: 1 } })
        })
        expect(await http.get('/example')).toEqual({ id: 1 })
        expect(messages).toEqual([])
    })

    test('mock 响应保留业务错误文案', async () => {
        const { http, messages, expired } = fixture(async (config) =>
            response(config, { code: 2003, message: '无权访问此团队', data: null }, 403),
        )
        await expect(http.get('/example')).rejects.toThrow('无权访问此团队')
        expect(messages).toEqual(['无权访问此团队'])
        expect(expired()).toBe(0)
    })

    for (const [status, code, message] of [
        [400, 1000, '字段缺失'],
        [403, 2003, '无权访问此团队'],
        [409, 4000, '当前状态不允许操作'],
        [500, 5000, '服务器内部错误'],
    ] as const) {
        test(`真实 HTTP ${status} 响应保留业务提示`, async () => {
            const { http, messages, expired } = fixture(async (config) => {
                const result = response(config, { code, message, data: null }, status)
                throw new AxiosError(
                    'Request failed',
                    AxiosError.ERR_BAD_RESPONSE,
                    config,
                    undefined,
                    result,
                )
            })
            await expect(http.get('/example')).rejects.toThrow('Request failed')
            expect(messages).toEqual([message])
            expect(expired()).toBe(0)
        })
    }

    test('并发失效请求只清理一次会话和提示一次', async () => {
        const { http, messages, expired, token } = fixture(async (config) => {
            const result = response(config, { code: 2001, message: '登录已过期', data: null }, 401)
            throw new AxiosError('expired', AxiosError.ERR_BAD_REQUEST, config, undefined, result)
        })
        const results = await Promise.allSettled([http.get('/one'), http.get('/two')])
        expect(results.every((result) => result.status === 'rejected')).toBe(true)
        expect(expired()).toBe(1)
        expect(token()).toBe('')
        expect(messages).toEqual(['登录已过期'])
    })

    test('成功 HTTP 中的认证错误同样触发会话失效', async () => {
        const { http, messages, expired } = fixture(async (config) =>
            response(config, { code: 2000, message: '请先登录', data: null }),
        )
        await expect(http.get('/example')).rejects.toThrow('请先登录')
        expect(expired()).toBe(1)
        expect(messages).toEqual(['请先登录'])
    })

    test('没有业务响应体的 HTTP 401 仍清理会话', async () => {
        const { http, expired, messages } = fixture(async (config) => {
            throw new AxiosError(
                'unauthorized',
                AxiosError.ERR_BAD_REQUEST,
                config,
                undefined,
                response(config, 'Unauthorized', 401),
            )
        })
        await expect(http.get('/example')).rejects.toThrow()
        expect(expired()).toBe(1)
        expect(messages).toEqual(['登录状态已失效，请重新登录'])
    })

    test('格式不正确的成功响应不会被当作业务数据', async () => {
        const { http, messages } = fixture(async (config) =>
            response(config, '<html>proxy page</html>'),
        )
        await expect(http.get('/example')).rejects.toThrow('接口响应格式不正确')
        expect(messages).toEqual(['接口响应格式不正确'])
    })

    test('超时和网络错误使用不同提示', async () => {
        for (const [code, message] of [
            [AxiosError.ECONNABORTED, '请求超时，请稍后重试'],
            [AxiosError.ERR_NETWORK, '网络异常，请确认后端服务已启动'],
        ] as const) {
            const { http, messages } = fixture(async (config) => {
                throw new AxiosError('failed', code, config)
            })
            await expect(http.get('/example')).rejects.toThrow()
            expect(messages).toEqual([message])
        }
    })

    test('主动取消请求不弹出错误提示', async () => {
        const { http, messages } = fixture(async () => {
            throw new CanceledError()
        })
        await expect(http.get('/example')).rejects.toThrow()
        expect(messages).toEqual([])
    })
})

describe('受控 Excel 下载', () => {
    test('成功文件保留 Blob，附加认证头', async () => {
        const file = new Blob(['xlsx'])
        const { http, messages } = fixture(async (config) => {
            expect(config.headers.Authorization).toBe('Bearer test-token')
            return {
                ...response(config, file),
                headers: {
                    'content-type':
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                },
            }
        })
        expect(await http.download('/analysis/exports/indicators')).toBe(file)
        expect(messages).toEqual([])
    })
    test('下载收到 JSON 认证失败时清理会话，不返回伪文件', async () => {
        const { http, messages, expired } = fixture(async (config) =>
            response(
                config,
                new Blob([JSON.stringify({ code: 2001, message: '登录已过期', data: null })]),
            ),
        )
        await expect(http.download('/analysis/exports/indicators')).rejects.toThrow('登录已过期')
        expect(expired()).toBe(1)
        expect(messages).toEqual(['登录已过期'])
    })
    test('HTTP 错误 Blob 仍解析业务提示', async () => {
        const { http, messages } = fixture(async (config) => {
            throw new AxiosError(
                'Forbidden',
                AxiosError.ERR_BAD_RESPONSE,
                config,
                undefined,
                response(
                    config,
                    new Blob([JSON.stringify({ code: 2003, message: '无导出权限', data: null })]),
                    403,
                ),
            )
        })
        await expect(http.download('/analysis/exports/indicators')).rejects.toThrow()
        expect(messages).toEqual(['无导出权限'])
    })
})

describe('受控合同附件下载', () => {
    test('合法PDF保持二进制响应并携带认证头', async () => {
        const file = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
        const { http, messages } = fixture(async (config) => {
            expect(config.headers.Authorization).toBe('Bearer test-token')
            return { ...response(config, file), headers: { 'content-type': 'application/pdf' } }
        })
        expect(await http.download('/files/1/download')).toBe(file)
        expect(messages).toEqual([])
    })
})
