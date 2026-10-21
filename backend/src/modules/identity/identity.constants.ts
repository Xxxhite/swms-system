import { businessPermissionEntries } from "@/modules/project/business-permissions"
export const positions = [
  "实习生",
  "助理",
  "社工",
  "团队主任",
  "项目督导",
  "项目总监",
  "总部专员",
  "高级主任",
  "部门总监",
  "高管",
  "机构负责人",
  "机构管理员",
].map((name, index) => ({ code: `position-${index + 1}`, name }))
export const serviceFields = [
  "福利救助",
  "社会救助",
  "其他-退役军人",
  "社区建设",
  "其他-场馆",
  "禁毒戒毒",
  "其他-社会福利",
  "其他-双百",
  "其他-反恐",
  "其他-心理",
  "教育辅导",
  "残障康复",
  "精神卫生",
  "职工帮扶",
  "纠纷调节",
  "其他",
].map((name) => ({ code: name, name }))
export const dictionaries = {
  positions,
  serviceFields,
  education: ["博士", "硕士", "本科", "大专", "高中及以下", "其他"].map((name) => ({
    code: name,
    name,
  })),
  politicalStatus: ["中共党员", "中共预备党员", "共青团员", "群众", "其他"].map((name) => ({
    code: name,
    name,
  })),
}

export const permissionCatalog = [
  ...businessPermissionEntries,
  ["system:view", "系统管理"],
  ["system:org:manage", "管理组织"],
  ["system:user:view", "查询人员"],
  ["system:user:manage", "维护人员"],
  ["system:user:authorize", "人员授权"],
  ["system:registration:view", "查询注册审核"],
  ["system:registration:approve", "审核注册"],
  ["system:role:manage", "管理角色权限"],
  ["system:log:view", "查询操作日志"],
  ["service:monitor:view", "指标监测"],
  ["service:archive:view", "查询服务档案"],
  ["service:archive:approve", "审批档案"],
  ["project:view", "查询项目"],
  ["activity:view", "查询活动"],
  ["resource:view", "查询资源"],
  ["analysis:view", "数据分析"],
  ["knowledge:view", "查询知识"],
  ["knowledge:document:download", "下载知识资料"],
].map(([code, name]) => {
  const parts = code.split(":")
  return {
    code,
    name,
    module: parts[0],
    resource: parts.length === 3 ? parts[1] : "module",
    action: parts.at(-1)!,
  }
})
