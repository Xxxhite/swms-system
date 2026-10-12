/**
 * 功能权限码表。菜单（src/router/routes.ts）和 mock 账号（src/mock/auth.ts）都用它，
 * 避免两边写字符串写错。后端接口权限校验会用同一套编码。
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
} as const

/** 角色编码 */
export const ROLE = {
    ADMIN: 'admin',
    SUPERVISOR: 'supervisor',
    LEADER: 'leader',
    SOCIAL: 'social',
} as const
