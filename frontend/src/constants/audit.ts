/** 审计动作编码沿用后端记录，中文字典同时用于表格显示和筛选选项。 */
export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
    'save-service-record': '保存服务档案草稿',
    'submit-service-record': '提交服务档案审批',
    'delete-service-record': '删除服务档案草稿',
    'withdraw-service-submission': '撤回服务档案提交',
    'request-service-change': '申请服务档案变更',
    'withdraw-service-change': '撤回服务档案变更',
    'approve-service-record': '批准服务档案',
    'reject-service-record': '驳回服务档案',
    'save-project-members': '维护项目成员',
    'upload-contract-file': '上传合同附件',
    'download-contract-file': '下载合同附件',
    'remove-contract-file': '移除合同附件',
    'create-project': '登记项目',
    'update-project': '修改项目',
    'activate-project': '启用项目',
    'delete-project': '删除草稿项目',
    'save-contract': '保存合同',
    'save-project-teams': '维护服务团队',
    'save-service-points': '维护服务点',
    'save-indicator': '保存指标',
    'allocate-indicator': '调整指标目标',
    'activate-indicator': '启用指标',
    'delete-indicator': '删除草稿指标',
    'save-monthly': '保存月报草稿',
    'submit-monthly': '提交月报',
    'delete-monthly': '删除月报草稿',
    'request-monthly-change': '申请月报变更',
    'withdraw-monthly-change': '撤回月报变更',
    'approve-monthly-change': '批准月报变更',
    'reject-monthly-change': '驳回月报变更',

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
    project: '项目',
    indicator: '指标',
    service_record: '服务档案',
    service_record_change: '服务档案变更',
    contract_file: '合同附件',
    monthly_report: '历史月报',
    monthly_change: '月报变更',
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
