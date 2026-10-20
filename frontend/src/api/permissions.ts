/**
 * 功能权限码表。菜单（src/router/routes.ts）和 mock 账号（src/mock/auth.ts）都用它，
 * 统一前端功能权限标识；后端接入时需对齐权限编码并独立执行授权校验。
 */
export const PERM = {
    /** 服务管理 — 指标监测端：合同包立项、指标设置、完成情况与预警 */
    SERVICE_MONITOR: 'service:monitor:view',
    /** 服务管理 — 执行端：9 类服务档案 */
    SERVICE_ARCHIVE: 'service:archive:view',
    /** 档案审批（团队主任初审、督导审批） */
    SERVICE_APPROVE: 'service:archive:approve',
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
