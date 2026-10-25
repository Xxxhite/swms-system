import type { AxiosRequestConfig } from 'axios'

import { PERM, ROLE } from '@/api/permissions'
import type { ApiResponse, CurrentUser } from '@/api/types'

/**
 * 本地认证模拟数据，供 mock 登录、用户资料查询和登录页账号提示使用。
 * 密码统一 123456，登录页会给出提示。
 */
interface MockAccount {
    password: string
    user: CurrentUser
}

const allPermissions = Object.values(PERM)
const readBusiness = [
    PERM.PROJECT,
    PERM.PROJECT_RECORD_VIEW,
    PERM.SERVICE_MONITOR,
    PERM.INDICATOR_VIEW,
    PERM.MONTHLY_VIEW,
]
const reportBusiness = [
    PERM.MONTHLY_CREATE,
    PERM.MONTHLY_UPDATE,
    PERM.MONTHLY_SUBMIT,
    PERM.MONTHLY_DELETE,
]

const accounts: Record<string, MockAccount> = {
    admin: {
        password: '123456',
        user: {
            status: 'ACTIVE',
            reviewComment: null,
            orgId: 1,
            orgName: '总部',
            positionCode: null,
            supervisorId: null,
            managedOrgIds: [],
            id: 1,
            username: 'admin',
            name: '机构管理员',
            roles: [ROLE.ADMIN],
            roleNames: ['机构管理员'],
            teamId: null,
            teamName: '总部',
            dataScope: 'ALL',
            permissions: allPermissions,
        },
    },
    supervisor: {
        password: '123456',
        user: {
            status: 'ACTIVE',
            reviewComment: null,
            orgId: 1,
            orgName: '总部',
            positionCode: 'position-8',
            supervisorId: null,
            isSupervisor: true,
            managedOrgIds: [],
            id: 2,
            username: 'supervisor',
            name: '测试·王高级主任',
            roles: [ROLE.SUPERVISOR],
            roleNames: ['项目督导'],
            teamId: null,
            teamName: '总部',
            dataScope: 'ALL',
            permissions: [
                ...readBusiness,
                PERM.MONTHLY_APPROVE,
                PERM.ANALYSIS,
                PERM.REPORT_VIEW,
                PERM.REPORT_EXPORT,
                PERM.SERVICE_ARCHIVE,
                PERM.MONTHLY_VIEW,
                PERM.PROJECT_RECORD_VIEW,
                PERM.SERVICE_APPROVE,
                PERM.ACTIVITY,
                PERM.RESOURCE,
                PERM.KNOWLEDGE,
            ],
        },
    },
    leader: {
        password: '123456',
        user: {
            status: 'ACTIVE',
            reviewComment: null,
            orgId: 1,
            orgName: '总部',
            positionCode: null,
            supervisorId: null,
            managedOrgIds: [],
            id: 3,
            username: 'leader',
            name: '海珠团队主任',
            roles: [ROLE.LEADER],
            roleNames: ['团队主任'],
            teamId: 11,
            teamName: '海珠团队',
            dataScope: 'TEAM',
            permissions: [
                ...readBusiness,
                ...reportBusiness,
                PERM.MONTHLY_APPROVE,
                PERM.SERVICE_MONITOR,
                PERM.SERVICE_ARCHIVE,
                PERM.MONTHLY_VIEW,
                PERM.PROJECT_RECORD_VIEW,
                PERM.SERVICE_APPROVE,
                PERM.PROJECT,
                PERM.ACTIVITY,
                PERM.RESOURCE,
                PERM.KNOWLEDGE,
            ],
        },
    },
    social: {
        password: '123456',
        user: {
            status: 'ACTIVE',
            reviewComment: null,
            orgId: 1,
            orgName: '总部',
            positionCode: null,
            supervisorId: null,
            managedOrgIds: [],
            id: 4,
            username: 'social',
            name: '一线社工',
            roles: [ROLE.SOCIAL],
            roleNames: ['社工'],
            teamId: 11,
            teamName: '海珠团队',
            dataScope: 'SELF',
            permissions: [
                ...readBusiness,
                ...reportBusiness,
                PERM.SERVICE_ARCHIVE,
                PERM.MONTHLY_VIEW,
                PERM.PROJECT_RECORD_VIEW,
                PERM.KNOWLEDGE,
            ],
        },
    },
}

function readBody(config: AxiosRequestConfig): Record<string, unknown> {
    const raw = config.data
    if (!raw) return {}
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) as Record<string, unknown>
        } catch {
            return {}
        }
    }
    return raw as Record<string, unknown>
}

/** 从请求头中的模拟 token 查找本地账号；仅用于 mock 认证流程 */
function currentAccount(config: AxiosRequestConfig): MockAccount | null {
    const header = (config.headers?.Authorization ?? config.headers?.authorization) as
        string | undefined
    const token = header?.replace(/^Bearer\s+/, '') ?? ''
    const username = token.replace(/^mock-token-/, '')
    return accounts[username] ?? null
}

export function mockLogin(config: AxiosRequestConfig): ApiResponse<unknown> {
    const body = readBody(config)
    const username = String(body.username ?? '')
    const password = String(body.password ?? '')
    const account = accounts[username]

    if (!account || account.password !== password) {
        return { code: 1000, message: '账号或密码不正确', data: null }
    }

    return {
        code: 0,
        message: 'ok',
        data: { token: `mock-token-${username}`, user: account.user },
    }
}

export function mockProfile(config: AxiosRequestConfig): ApiResponse<unknown> {
    const account = currentAccount(config)
    if (!account) {
        return { code: 2000, message: '登录状态已失效，请重新登录', data: null }
    }
    return { code: 0, message: 'ok', data: account.user }
}

export function mockLogout(): ApiResponse<unknown> {
    return { code: 0, message: 'ok', data: null }
}

/** 登录页用来提示可用账号，只在 mock 模式下展示 */
export const mockAccountsHint = Object.entries(accounts).map(([username, account]) => ({
    username,
    roleName: account.user.roleNames.join('/'),
    password: account.password,
}))
