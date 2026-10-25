/**
 * 功能权限码表。菜单（src/router/routes.ts）和 mock 账号（src/mock/auth.ts）都用它，
 * 统一前端功能权限标识；后端接入时需对齐权限编码并独立执行授权校验。
 */
export const PERM = {
    PROJECT_RECORD_VIEW: 'project:record:view',
    PROJECT_CREATE: 'project:record:create',
    PROJECT_UPDATE: 'project:record:update',
    PROJECT_DELETE: 'project:record:delete',
    INDICATOR_VIEW: 'service:indicator:view',
    INDICATOR_MANAGE: 'service:indicator:manage',
    INDICATOR_ALLOCATE: 'service:indicator:allocate',
    MONTHLY_CREATE: 'service:monthly:create',
    MONTHLY_UPDATE: 'service:monthly:update',
    MONTHLY_SUBMIT: 'service:monthly:submit',
    MONTHLY_DELETE: 'service:monthly:delete',
    REPORT_VIEW: 'analysis:report:view',
    REPORT_EXPORT: 'analysis:report:export',

    /** 服务管理 — 指标监测端：合同包立项、指标设置、完成情况与预警 */
    SERVICE_MONITOR: 'service:monitor:view',
    /** 服务管理 — 历史档案查询入口标识 */
    SERVICE_ARCHIVE: 'service:archive:view',
    /** 历史档案审批入口标识；当前档案使用直接主管单级审批 */
    SERVICE_APPROVE: 'service:archive:approve',
    MONTHLY_VIEW: 'service:monthly:view',
    MONTHLY_APPROVE: 'service:monthly:approve',
    PROJECT: 'project:view',
    ACTIVITY: 'activity:view',
    RESOURCE: 'resource:view',
    ANALYSIS: 'analysis:view',
    KNOWLEDGE: 'knowledge:view',
    SYSTEM: 'system:view',
    ORG_MANAGE: 'system:org:manage',
    USER_VIEW: 'system:user:view',
    USER_MANAGE: 'system:user:manage',
    USER_AUTHORIZE: 'system:user:authorize',
    REGISTRATION_VIEW: 'system:registration:view',
    REGISTRATION_APPROVE: 'system:registration:approve',
    ROLE_MANAGE: 'system:role:manage',
    LOG_VIEW: 'system:log:view',
} as const

/** 角色编码 */
export const ROLE = {
    ADMIN: 'admin',
    SUPERVISOR: 'supervisor',
    LEADER: 'leader',
    SOCIAL: 'social',
} as const
