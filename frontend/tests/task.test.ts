import { expect, test } from 'bun:test'
import {
    splitAmount,
    taskPayload,
    emptyTask,
    toBusinessInput,
    taskStatusLabel,
} from '../src/api/task-types'
import { PERM } from '../src/api/permissions'
import { filterMenuTree, menuTree, menuToRoutes } from '../src/router/routes'
test('计划均分保留百分位尾差，业务时间固定UTC+8', () => {
    expect(splitAmount('10.01', 2)).toEqual(['5.00', '5.01'])
    expect(splitAmount('0.01', 3)).toEqual(['0.00', '0.00', '0.01'])
    const input = { ...emptyTask(), startAt: '2026-11-04T09:00:00', endAt: '2026-11-04T10:00:00' }
    expect(taskPayload(input).startAt).toBe('2026-11-04T09:00:00+08:00')
    expect(toBusinessInput('2026-11-04T01:00:00Z')).toBe(input.startAt)
    expect(taskPayload({ ...input, startAt: '2026-11-04T01:00:00Z' }).startAt).toBe(
        '2026-11-04T01:00:00Z',
    )
})
test('任务及计划详情随读取权限注册，维护动作不扩大读取入口', () => {
    const paths = (permissions: string[]) =>
        menuToRoutes(filterMenuTree(menuTree, permissions)).map((r) => r.path)
    expect(paths([PERM.ACTIVITY])).toContain('/activity/:id')
    expect(paths([PERM.PLAN_VIEW])).toContain('/service/plans/:id')
    expect(paths([PERM.TASK_CREATE, PERM.PLAN_MANAGE])).not.toContain('/activity/:id')
    expect(paths([PERM.TASK_CREATE, PERM.PLAN_MANAGE])).not.toContain('/service/plans/:id')
})

test('任务列表与执行登记共用业务状态，旧流程标签保持', () => {
    expect(taskStatusLabel({ state: 'SCHEDULED', registrationState: 'TO_REGISTER' })).toBe('待登记')
    expect(taskStatusLabel({ state: 'TO_ORGANIZE', registrationState: 'REJECTED' })).toBe('已退回')
    expect(taskStatusLabel({ state: 'IN_REVIEW', registrationState: 'NEEDS_CORRECTION' })).toBe(
        '待更正',
    )
    expect(taskStatusLabel({ state: 'SCHEDULED' })).toBe('待开展')
})
