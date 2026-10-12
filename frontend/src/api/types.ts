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
 * 数据范围（权限粒度的第二个维度，见项目说明）。
 * - SELF 只能看本人
 * - TEAM 只能看本团队
 * - ALL  不限（督导、总部、机构管理员）
 */
export type DataScope = 'SELF' | 'TEAM' | 'ALL'

/** 当前登录用户 */
export interface CurrentUser {
    id: number
    username: string
    name: string
    /** 角色编码，用于判断职责 */
    roles: string[]
    /** 角色中文名，直接展示 */
    roleNames: string[]
    teamId: number | null
    teamName: string
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
