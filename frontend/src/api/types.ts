/** 统一响应体，与后端 backend/src/utils/response.ts 保持一致 */
export interface ApiResponse<T> {
    code: number
    message: string
    data: T | null
}

/** 分页响应体 */
export interface PageResult<T> {
    list: T[]
    total: number
    page: number
    pageSize: number
}

/**
 * 数据访问范围，与功能权限分别配置；服务端需按该范围过滤业务数据。
 * - SELF：本人数据
 * - TEAM：本团队数据
 * - SUBTREE：负责组织及下级数据
 * - ALL：全部数据
 */
export type DataScope = 'SELF' | 'TEAM' | 'SUBTREE' | 'ALL'
export type AccountStatus = 'PENDING' | 'REJECTED' | 'ACTIVE' | 'DISABLED' | 'LEFT'

/** 当前登录用户 */
export interface CurrentUser {
    id: number
    username: string
    name: string
    status: AccountStatus
    reviewComment: string | null
    orgId: number | null
    orgName: string | null
    isSupervisor?: boolean
    isDevSuperadmin?: boolean
    serviceFieldCodes?: string[]
    positionCode: string | null
    supervisorId: number | null
    managedOrgIds: number[]
    /** 角色编码，用于判断职责 */
    roles: string[]
    /** 角色中文名，直接展示 */
    roleNames: string[]
    teamId: number | null
    teamName: string | null
    dataScope: DataScope
    /** 功能权限码，如 service:monitor:view */
    permissions: string[]
}

export interface LoginPayload {
    username: string
    password: string
}

export interface LoginResult {
    token: string
    user: CurrentUser
}

export interface RegistrationInput {
    username: string
    password: string
    name: string
    phone: string
    arrivalDate: string
    major: string
    proposedPosition: string
    education: string
    politicalStatus: string
    socialWorkerNo?: string | null
    serviceFieldCodes?: string[]
    serviceFieldCode?: string | null
    proposedTeam?: string | null
}
export interface UserDetail extends CurrentUser {
    createdAt: string
    version: number
    phone: string
    arrivalDate: string
    major: string
    proposedPosition: string
    proposedTeam: string | null
    education: string
    politicalStatus: string
    socialWorkerNo: string | null
    serviceFieldCode: string | null
    roleIds: number[]
    extraPermissions: string[]
}
/** 列表仅返回人员摘要；完整授权信息通过详情接口读取。 */
export type UserSummary = Pick<
    UserDetail,
    | 'id'
    | 'username'
    | 'name'
    | 'phone'
    | 'status'
    | 'proposedPosition'
    | 'dataScope'
    | 'version'
    | 'createdAt'
>
export type PersonalProfile = Omit<UserDetail, 'roleIds' | 'extraPermissions'>
export interface Organization {
    id: number
    parentId: number | null
    code: string
    name: string
    type: 'HEADQUARTERS' | 'DEPARTMENT' | 'TEAM'
    status: 'ACTIVE' | 'DISABLED'
    sortOrder: number
    version: number
}
export interface Role {
    createdAt: string
    id: number
    code: string
    name: string
    description: string
    status: 'ACTIVE' | 'DISABLED'
    builtIn: number
    version: number
    permissionCodes: string[]
}
export interface Permission {
    code: string
    name: string
    module: string
    resource: string
    action: string
}
export interface AuthorizationInput {
    roleIds: number[]
    extraPermissions: string[]
    dataScope: DataScope
    managedOrgIds: number[]
}
export const statusLabels: Record<AccountStatus, string> = {
    PENDING: '待审核',
    REJECTED: '已驳回',
    ACTIVE: '已启用',
    DISABLED: '已停用',
    LEFT: '已离职',
}
