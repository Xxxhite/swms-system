export const resourcePermissionEntries = [
  ["resource:record:create", "新增单位资源"],
  ["resource:record:update", "维护单位资源"],
  ["resource:record:archive", "归档单位资源"],
  ["resource:record:merge", "合并单位资源"],
  ["resource:contact:view", "查看资源联系方式"],
  ["resource:contact:manage", "维护资源联系人"],
  ["resource:cooperation:manage", "维护合作事项"],
  ["resource:followup:manage", "维护资源跟进"],
]
export const resourceRoleDefaults: Record<string, string[]> = Object.fromEntries(
  ["project_manager", "supervisor", "leader", "social"].map((role) => [
    role,
    [
      "resource:view",
      ...resourcePermissionEntries
        .filter(([code]) => !["resource:record:archive", "resource:record:merge"].includes(code))
        .map(([code]) => code),
    ],
  ]),
)
