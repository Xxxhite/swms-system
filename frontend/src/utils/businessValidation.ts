import type { FormInstance, FormItemRule } from 'element-plus'

/** 将业务校验转换为字段提示；失焦和选项变化均可触发。 */
export function fieldRule(check: (value: unknown) => string | undefined): FormItemRule {
    return {
        trigger: ['blur', 'change'],
        validator: (_rule, value, callback) => {
            const issue = check(value)
            callback(issue ? new Error(issue) : undefined)
        },
    }
}

/** 必填文本忽略首尾空白判断，长度按原始输入检查。 */
export function textIssue(value: unknown, label: string, max: number): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return `请填写${label}`
    if (value.length > max) return `${label}最多 ${max} 个字符`
}

/** 数量与金额使用十进制字符串；与后端一致，拒绝负数、指数和多余小数位。 */
export function decimalIssue(
    value: unknown,
    label: string,
    positive = false,
    integerDigits = 10,
): string | undefined {
    const pattern = new RegExp(`^(0|[1-9][0-9]{0,${integerDigits - 1}})(\\.[0-9]{1,2})?$`)
    if (typeof value !== 'string' || !pattern.test(value))
        return `${label}须为非负数，整数最多 ${integerDigits} 位、小数最多 2 位`
    if (positive && !/[1-9]/.test(value)) return `${label}须大于零`
}

/** 日期必须真实存在，不能仅凭 YYYY-MM-DD 外形通过校验。 */
export function dateIssue(value: unknown, label: string): string | undefined {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `请选择${label}`
    const date = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
        return `${label}不是有效日期`
}

/** 月份按业务时区传入当前月，允许历史填报，阻止未来月份。 */
export function monthIssue(value: unknown, currentMonth: string): string | undefined {
    if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
        return '请选择有效的填报月份'
    if (value > currentMonth) return '填报月份不能晚于当前月份'
}

/** 表单尚未挂载或字段不合法时停止保存，错误留在对应字段下方。 */
export async function validateForm(form: FormInstance | undefined): Promise<boolean> {
    if (!form) return false
    return form.validate().catch(() => false)
}
