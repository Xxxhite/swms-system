import { http } from '@/api/request'
import type {
    CurrentUser,
    LoginPayload,
    LoginResult,
    RegistrationInput,
    PersonalProfile,
} from '@/api/types'

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
    register(input: RegistrationInput): Promise<{ id: number; status: string }> {
        return http.post('/auth/register', input)
    },
    detail(): Promise<PersonalProfile> {
        return http.get('/auth/profile')
    },
    updateProfile(input: Record<string, unknown>): Promise<{ version: number }> {
        return http.put('/auth/profile', input)
    },
    resubmit(version: number): Promise<{ version: number }> {
        return http.post('/auth/registration/submit', { version })
    },
    changePassword(oldPassword: string, newPassword: string): Promise<null> {
        return http.put('/auth/password', { oldPassword, newPassword })
    },
}
