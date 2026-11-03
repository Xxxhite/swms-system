export const executionPermissionEntries = [
  ["service:execution:view", "查看现场执行及手机入口"],
  ["service:execution:record", "记录本人到离及参与"],
  ["service:execution:manage", "开始结束及中止现场服务"],
  ["service:execution:configure", "配置现场规则"],
  ["service:execution:supplement", "补录及更正现场来源"],
  ["service:participant:view", "查看授权服务对象"],
  ["service:participant:manage", "维护授权对象及名单"],
  ["service:participant:contact", "查看授权对象联系方式"],
  ["service:credential:issue", "发放撤销个人参与凭证"],
  ["service:evidence:view", "查看授权现场凭证"],
  ["service:evidence:upload", "上传现场凭证"],
  ["service:exception:view", "查看授权现场异常"],
  ["service:exception:explain", "补充本人异常说明"],
]
const all = executionPermissionEntries.map(([code]) => code!)
export const executionRoleDefaults: Record<string, string[]> = {
  project_manager: all,
  supervisor: all,
  leader: all,
  social: all.filter((c) => c !== "service:execution:configure"),
  intern: [],
}
