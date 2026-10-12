import {http} from '@/api/request'
import type {CurrentUser, LoginPayload, LoginResult} from '@/api/types'

/** 基本信息模块：登录与当前用户 */
export const authApi = {
    login(payload: LoginPayload): Promise<LoginResult> {
        return http.post<LoginResult>('/auth/login', payload)
    },
    profile(): Promise<CurrentUser> {
        return http.get<CurrentUser>('/auth/profile')
    },
    logout(): Promise<null> {
        return http.post<null>('/auth/logout')
    },
}
