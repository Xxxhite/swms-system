export const feedbackPermissionEntries = [
  ["service:feedback:view", "查看服务反馈"],
  ["service:feedback:manage", "登记服务反馈"],
  ["resource:cooperation:evaluate", "评价合作事项"],
]
export const feedbackRoleDefaults: Record<string, string[]> = Object.fromEntries(
  ["project_manager", "supervisor", "leader", "social"].map((r) => [
    r,
    feedbackPermissionEntries.map(([c]) => c),
  ]),
)
