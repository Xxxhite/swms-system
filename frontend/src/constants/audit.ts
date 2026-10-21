/** 审计动作编码沿用后端记录，中文字典同时用于表格显示和筛选选项。 */
export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
    register: '提交注册申请',
    login: '登录',
    logout: '退出登录',
    'update-profile': '修改个人资料',
    'resubmit-registration': '重新提交注册申请',
    'change-password': '修改密码',
    'approve-registration': '批准注册申请',
    'reject-registration': '驳回注册申请',
    'update-user': '修改人员资料',
    'change-status': '变更账号状态',
    'authorize-user': '调整人员授权',
    'save-org': '保存组织',
    'delete-org': '删除组织',
    'save-role': '保存角色及权限',
})

/** 被操作的数据类别，与人员角色或账号状态分别管理。 */
export const AUDIT_ENTITY_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
    user: '用户',
    role: '角色',
    organization: '组织',
})

/** 返回动作中文名称；尚未配置的新编码使用统一占位文案。 */
export function auditActionLabel(code: string): string {
    return Object.prototype.hasOwnProperty.call(AUDIT_ACTION_LABELS, code)
        ? AUDIT_ACTION_LABELS[code]!
        : '未知动作'
}

/** 返回对象类型中文名称，避免未知编码被误识别为字典原型属性。 */
export function auditEntityTypeLabel(code: string): string {
    return Object.prototype.hasOwnProperty.call(AUDIT_ENTITY_TYPE_LABELS, code)
        ? AUDIT_ENTITY_TYPE_LABELS[code]!
        : '未知对象'
}
