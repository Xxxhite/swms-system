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
    /** 提交账号密码，取得登录凭证及当前账号的有效身份。 */
    login(payload: LoginPayload): Promise<LoginResult> {
        return http.post<LoginResult>('/auth/login', payload)
    },
    /** 恢复当前身份，供 store 计算菜单、数据范围和审核页分流。 */
    profile(): Promise<CurrentUser> {
        return http.get<CurrentUser>('/auth/profile')
    },
    /** 通知后端记录退出；本地凭证及路由由 store 负责清理。 */
    logout(): Promise<null> {
        return http.post<null>('/auth/logout')
    },
    /** 提交员工注册资料，创建待审核账号。 */
    register(input: RegistrationInput): Promise<{ id: number; status: string }> {
        return http.post('/auth/register', input)
    },
    /** 读取本人完整资料及版本，供个人中心和审核状态页编辑。 */
    detail(): Promise<PersonalProfile> {
        return http.get('/auth/profile')
    },
    /** 更新状态允许的本人资料，返回保存后的版本供后续操作使用。 */
    updateProfile(input: Record<string, unknown>): Promise<{ version: number }> {
        return http.put('/auth/profile', input)
    },
    /** 使用最新资料版本，将被驳回申请重新提交审核。 */
    resubmit(version: number): Promise<{ version: number }> {
        return http.post('/auth/registration/submit', { version })
    },
    /** 提交原密码和新密码，成功后旧凭证失效，需要重新登录。 */
    changePassword(oldPassword: string, newPassword: string): Promise<null> {
        return http.put('/auth/password', { oldPassword, newPassword })
    },
}
