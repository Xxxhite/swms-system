export const managementPermissionEntries = [
  ["management:followup:view", "查看管理跟进"],
  ["management:followup:manage", "维护管理跟进"],
]
export const managementRoleDefaults: Record<string, string[]> = Object.fromEntries(
  ["project_manager", "supervisor", "leader", "social"].map((r) => [
    r,
    managementPermissionEntries.map(([c]) => c),
  ]),
)
