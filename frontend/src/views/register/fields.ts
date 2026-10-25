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
        serviceFieldCodes: [],
    }
}
const PERSONNEL_FIELDS = {
    name: { label: '姓名', max: 50 },
    phone: { label: '联系电话', max: 32 },
    arrivalDate: { label: '到岗日期', max: 10 },
    major: { label: '专业', max: 100 },
    proposedPosition: { label: '申请岗位', max: 100 },
    education: { label: '最高学历', max: 100 },
    politicalStatus: { label: '政治面貌', max: 100 },
} as const

/** 返回具体字段的中文错误；日期按原字符串回验，拒绝日期自动进位。 */
export function registrationIssue(field: string, value: unknown): string | undefined {
    if (field === 'serviceFieldCodes')
        return Array.isArray(value) && value.length > 0 ? undefined : '请至少选择一个服务领域'
    const text = typeof value === 'string' ? value : ''
    if (field === 'username')
        return /^[a-z0-9_]{3,32}$/.test(text) ? undefined : '账号为 3—32 位小写字母、数字或下划线'
    if (field === 'password')
        return text.length >= 8 && text.length <= 128 ? undefined : '密码须为 8—128 字符'
    const config = PERSONNEL_FIELDS[field as keyof typeof PERSONNEL_FIELDS]
    if (!config) return undefined
    if (!text.trim()) return `请填写${config.label}`
    if (text.length > config.max) return `${config.label}最多 ${config.max} 字符`
    if (field === 'arrivalDate') {
        const date = new Date(`${text}T00:00:00Z`)
        if (
            !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(text) ||
            !Number.isFinite(date.getTime()) ||
            date.toISOString().slice(0, 10) !== text
        )
            return '请选择有效的到岗日期'
    }
    return undefined
}

/** 表单失焦、改值和提交均复用同一校验，申请修改不包含账号和密码。 */
function fieldRules(fields: string[]): FormRules {
    return Object.fromEntries(
        fields.map((field) => [
            field,
            [
                {
                    required: true,
                    trigger: ['blur', 'change'],
                    validator: (_rule, value, callback) => {
                        const issue = registrationIssue(field, value)
                        callback(issue ? new Error(issue) : undefined)
                    },
                },
            ],
        ]),
    )
}
export const personnelRules = fieldRules([...Object.keys(PERSONNEL_FIELDS), 'serviceFieldCodes'])
export const registrationRules = fieldRules([
    ...Object.keys(PERSONNEL_FIELDS),
    'serviceFieldCodes',
    'username',
    'password',
])
/** 将可后补的社工号和拟团队空文本转为 null，明确表达未填写。 */
export function nullablePersonnel(input: ReturnType<typeof personnelDefaults>) {
    return {
        ...input,
        socialWorkerNo: input.socialWorkerNo?.trim() || null,
        proposedTeam: input.proposedTeam?.trim() || null,
    }
}
