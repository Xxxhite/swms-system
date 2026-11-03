export const taskPermissionEntries = [
  ["activity:task:create", "新增服务任务"],
  ["activity:task:update", "维护服务任务安排"],
  ["activity:task:cancel", "取消服务任务"],
  ["service:plan:view", "查看阶段计划"],
  ["service:plan:manage", "维护及发布阶段计划"],
]
export const taskRoleDefaults: Record<string, string[]> = {
  project_manager: ["activity:view", ...taskPermissionEntries.map(([code]) => code!)],
  supervisor: ["activity:view", ...taskPermissionEntries.map(([code]) => code!)],
  leader: ["activity:view", ...taskPermissionEntries.map(([code]) => code!)],
  social: ["activity:view", "service:plan:view"],
  intern: [],
}
