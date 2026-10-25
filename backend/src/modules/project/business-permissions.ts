/** 第二阶段动作目录；默认角色采用显式清单，新增权限不会自动扩大已有角色。 */
export const businessPermissionEntries = [
  ["project:record:view", "查询项目资料"],
  ["project:record:create", "登记项目"],
  ["project:record:update", "维护项目配置"],
  ["project:record:delete", "删除草稿项目"],
  ["service:indicator:view", "查询项目指标"],
  ["service:indicator:manage", "设置项目指标"],
  ["service:indicator:allocate", "分配指标目标"],
  ["service:monthly:view", "查询服务档案"],
  ["service:monthly:create", "新增服务档案草稿"],
  ["service:monthly:update", "维护及申请更正服务档案"],
  ["service:monthly:submit", "提交服务档案审批"],
  ["service:monthly:delete", "撤销服务档案"],
  ["service:monthly:approve", "审批服务档案"],
  ["analysis:report:view", "查询指标预警表"],
  ["analysis:report:export", "导出指标报表"],
]
const reading = [
  "project:view",
  "project:record:view",
  "service:monitor:view",
  "service:indicator:view",
  "service:monthly:view",
]
const reporting = [
  "service:monthly:create",
  "service:monthly:update",
  "service:monthly:submit",
  "service:monthly:delete",
]
/** 仅首次建立角色或显式执行业务权限补充时使用，不覆盖已有自定义权限。 */
export const businessRoleDefaults: Record<string, string[]> = {
  project_manager: [
    ...reading,
    ...reporting,
    "service:monthly:approve",
    "analysis:view",
    "analysis:report:view",
    "analysis:report:export",
    "project:record:create",
    "project:record:update",
    "project:record:delete",
    "service:indicator:manage",
    "service:indicator:allocate",
  ],
  supervisor: [
    ...reading,
    ...reporting,
    "project:record:create",
    "project:record:update",
    "project:record:delete",
    "service:indicator:manage",
    "service:indicator:allocate",
    "analysis:view",
    "analysis:report:view",
    "analysis:report:export",
    "service:monthly:approve",
  ],
  leader: [...reading, ...reporting, "service:monthly:approve"],
  social: [...reading, ...reporting],
  intern: [],
}
