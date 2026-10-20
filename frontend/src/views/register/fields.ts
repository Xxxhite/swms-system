import type { FormRules } from 'element-plus'
import type { RegistrationInput } from '@/api/types'
/** 为注册及受限资料表单创建独立初始值，避免多个页面共享可变对象。 */
export function personnelDefaults(): Omit<RegistrationInput, 'username' | 'password'> {
    return {
        name: '',
        phone: '',
        arrivalDate: '',
        major: '',
        proposedPosition: '',
        education: '',
        politicalStatus: '',
        socialWorkerNo: '',
        proposedTeam: '',
    }
}
/** 注册和申请修改共用的人员必填规则，账号与密码规则由注册页补充。 */
export const personnelRules: FormRules = Object.fromEntries(
    [
        'name',
        'phone',
        'arrivalDate',
        'major',
        'proposedPosition',
        'education',
        'politicalStatus',
    ].map((key) => [key, [{ required: true, message: '请填写此项', trigger: 'change' }]]),
)
/** 将可后补的社工号和拟团队空文本转为 null，明确表达未填写。 */
export function nullablePersonnel(input: ReturnType<typeof personnelDefaults>) {
    return {
        ...input,
        socialWorkerNo: input.socialWorkerNo?.trim() || null,
        proposedTeam: input.proposedTeam?.trim() || null,
    }
}
