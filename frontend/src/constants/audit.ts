/** 审计动作编码沿用后端记录，中文字典同时用于表格显示和筛选选项。 */
export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
    'configure-execution': '维护现场规则',
    'record-staff-attendance': '记录到离',
    'end-execution': '结束服务',
    'stop-execution': '中止服务',
    'create-service-participant': '新增服务对象',
    'update-service-participant': '维护服务对象',
    'archive-service-participant': '归档服务对象',
    'add-execution-participant': '加入本次名单',
    'record-participation': '记录参与来源',
    'public-confirm-participation': '对象确认参与',
    'issue-participation-credential': '发放个人参与卡',
    'revoke-participation-credential': '撤销个人参与卡',
    'upload-execution-evidence': '上传现场凭证',
    'download-execution-evidence': '下载现场凭证',
    'remove-unbound-execution-evidence': '移除未绑定凭证',
    'save-execution-registration': '保存执行登记',
    'normalize-region-address': '规范地区地址',
    'explain-execution-exception': '追加异常说明',
    'save-service-plan': '保存阶段计划',
    'publish-service-plan': '发布阶段计划',
    'create-service-task': '新增服务任务',
    'update-service-task': '修改任务安排',
    'cancel-service-task': '取消服务任务',
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
    'create-resource': '新增资源',
    'update-resource': '维护资源',
    'archive-resource': '归档资源',
    'merge-resource': '合并资源',
    'save-resource-contact': '维护资源联系人',
    'save-resource-cooperation': '维护合作事项',
    'save-resource-followup': '记录资源跟进',
    'link-resource-contract': '关联合同资源',
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
    execution: '现场执行',
    participant: '服务对象',
    resource: '单位资源',
    'service-plan': '阶段计划',
    'service-task': '服务任务',
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
