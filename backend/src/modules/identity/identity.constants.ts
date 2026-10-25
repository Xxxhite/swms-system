import { businessPermissionEntries } from "@/modules/project/business-permissions"
export const positions = [
  {
    code: "position-1",
    name: "实习生",
  },
  {
    code: "position-2",
    name: "助理",
  },
  {
    code: "position-3",
    name: "社工",
  },
  {
    code: "position-4",
    name: "团队主任",
  },
  {
    code: "position-6",
    name: "项目总监",
  },
  {
    code: "position-7",
    name: "总部专员",
  },
  {
    code: "position-8",
    name: "高级主任",
  },
  {
    code: "position-9",
    name: "部门总监",
  },
  {
    code: "position-10",
    name: "高管",
  },
  {
    code: "position-11",
    name: "机构负责人",
  },
  {
    code: "position-12",
    name: "机构管理员",
  },
]
/** 业务管理岗位使用显式稳定编码；系统角色与岗位分别授权。 */
export const managementPositions = [
  "position-6",
  "position-8",
  "position-9",
  "position-10",
  "position-11",
]
export const canSupervise = (positionCode: string | null) =>
  managementPositions.includes(positionCode ?? "")
export const serviceFields = [
  "社会福利",
  "社会救助",
  "慈善事业",
  "社区建设",
  "婚姻家庭",
  "精神卫生",
  "残障康复",
  "教育辅导",
  "就业援助",
  "职工帮扶",
  "犯罪预防",
  "禁毒戒毒",
  "矫治帮教",
  "卫生健康",
  "纠纷调解",
  "应急处置",
  "其他-街道反邪教服务",
  "其他-现退役军人服务",
  "其他-场馆运营",
  "其他-双百服务",
  "其他-心理服务",
  "其他-督导输出",
  "其他",
].map((name) => ({ code: name, name }))
export const subFields = [
  "未成年人保护",
  "长者服务",
  "妇女家庭服务",
  "新就业群体服务",
  "志愿者服务",
].map((name) => ({ code: name, name }))
export const brands = ["馨守护", "馨起点", "馨生活", "馨生剧团", "馨+"].map((name) => ({
  code: name,
  name,
}))
export const dictionaries = {
  subFields,
  brands,
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
