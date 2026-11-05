import { describe, expect, test } from 'bun:test'
import { createRouter, createMemoryHistory } from 'vue-router'
import { captureLocation } from '../src/utils/geolocation'
import { createParticipationClient } from '../src/api/participation-client'
import {
    fieldRoutes,
    FIELD_LAYOUT_NAME,
    filterMenuTree,
    menuTree,
    menuToRoutes,
    publicRoutes,
} from '../src/router/routes'
import { PERM } from '../src/api/permissions'

describe('执行登记与原公开确认', () => {
    test('一次主动定位使用高精度、零缓存，保留拒绝和超时状态', async () => {
        let options: PositionOptions | undefined
        const sample = await captureLocation({
            getCurrentPosition(success, _error, settings) {
                options = settings
                success({
                    coords: { latitude: 23, longitude: 113, accuracy: 20 },
                    timestamp: 1793664000000,
                } as GeolocationPosition)
            },
        })
        expect(sample.status).toBe('OK')
        expect(options).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
        for (const [code, status] of [
            [1, 'DENIED'],
            [2, 'UNAVAILABLE'],
            [3, 'TIMEOUT'],
        ] as const) {
            expect(
                (
                    await captureLocation({
                        getCurrentPosition(_success, error) {
                            error?.({ code } as GeolocationPositionError)
                        },
                    })
                ).status,
            ).toBe(status)
        }
    })
    test('公开错误不携带员工令牌，保留员工存储及会话', async () => {
        let message = '',
            authorization: unknown = 'unset'
        const client = createParticipationClient(
            '/api',
            (value) => {
                message = value
            },
            async (config) => {
                authorization = config.headers.Authorization
                return {
                    config,
                    status: 200,
                    statusText: '',
                    headers: {},
                    data: { code: 2001, message: '参与卡已过期', data: null },
                }
            },
        )
        let failure: unknown
        try {
            await client.post('/execution/participation/resolve', { token: 'a'.repeat(43) })
        } catch (error) {
            failure = error
        }
        expect(failure).toBeInstanceOf(Error)
        expect(authorization).toBeUndefined()
        expect(message).toBe('参与卡已过期')
    })
    test('手机布局随权限装配与清理，桌面不重复注册，公开页独立', () => {
        expect(fieldRoutes([])).toEqual([])
        const permissions = [PERM.EXECUTION_VIEW, PERM.EXCEPTION_VIEW]
        const menus = filterMenuTree(menuTree, permissions)
        expect(menus[0]?.children?.[0]?.path).toBe('/field/tasks')
        expect(menus[0]?.children?.[0]?.title).toBe('执行登记')
        expect(menuToRoutes(menus).some((r) => r.path === '/field/tasks')).toBe(false)
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [...publicRoutes, ...fieldRoutes(permissions)],
        })
        expect(router.resolve('/field/tasks/12').name).toBe('FieldTaskDetail')
        expect(router.resolve('/field/exceptions').name).toBe('FieldExceptions')
        router.removeRoute(FIELD_LAYOUT_NAME)
        expect(router.hasRoute('FieldTaskDetail')).toBe(false)
        expect(router.hasRoute('FieldExceptions')).toBe(false)
        expect(router.resolve('/participation').meta.public).toBe(true)
    })
})
