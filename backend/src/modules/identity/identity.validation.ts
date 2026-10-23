import { t } from "elysia"
import { sortFields } from "@/utils/list-sort"
import { accountStatuses, dataScopes, orgTypes } from "@/db/schema"

/** 创建非空文本校验，拒绝全空白输入并限制最大长度。 */
export const text = (max = 100) => t.String({ minLength: 1, maxLength: max, pattern: "\\S" })
/** 创建可省略或显式置空的文本校验，用于允许后补的资料字段。 */
export const nullableText = (max = 100) => t.Optional(t.Union([text(max), t.Null()]))
export const id = t.Integer({ minimum: 1 })
export const version = { version: id }
export const idParams = t.Object({ id: t.Numeric({ minimum: 1, multipleOf: 1 }) })
/** 将固定编码数组转换为联合字面量校验，拒绝目录之外的取值。 */
const enumOf = <T extends string>(values: readonly T[]) =>
  t.Union(values.map((value) => t.Literal(value)))
/** 人员列表的分页及筛选参数，页码和每页数量须为正整数。 */
export const listQuery = t.Object({
  ...sortFields,
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1, default: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1, maximum: 100, default: 20 })),
  keyword: t.Optional(t.String({ maxLength: 100 })),
  status: t.Optional(enumOf(accountStatuses)),
})
/** 管理员授权字段：功能权限、数据范围和负责组织整体提交。 */
export const authorizationFields = {
  roleIds: t.Array(id, { maxItems: 50 }),
  extraPermissions: t.Array(text(), { maxItems: 100 }),
  dataScope: enumOf(dataScopes),
  managedOrgIds: t.Array(id, { maxItems: 100 }),
}
/** 任职字段：组织、岗位和直接主管由管理员在审核或维护时确定。 */
export const placementFields = {
  orgId: id,
  positionCode: text(32),
  supervisorId: t.Union([id, t.Null()]),
}
/** 注册及受限资料表单的人员字段，不包含账号授权和审核结果。 */
export const registrationFields = {
  name: t.String({
    minLength: 1,
    maxLength: 50,
    pattern: "\\S",
    error: "姓名须为 1—50 字符且不能全为空格",
  }),
  phone: t.String({
    minLength: 1,
    maxLength: 32,
    pattern: "\\S",
    error: "联系电话须为 1—32 字符且不能全为空格",
  }),
  arrivalDate: t.String({ format: "date", error: "请选择有效的到岗日期" }),
  major: t.String({
    minLength: 1,
    maxLength: 100,
    pattern: "\\S",
    error: "专业须为 1—100 字符且不能全为空格",
  }),
  proposedPosition: t.String({
    minLength: 1,
    maxLength: 100,
    pattern: "\\S",
    error: "申请岗位须为 1—100 字符且不能全为空格",
  }),
  education: t.String({
    minLength: 1,
    maxLength: 100,
    pattern: "\\S",
    error: "最高学历须为 1—100 字符且不能全为空格",
  }),
  politicalStatus: t.String({
    minLength: 1,
    maxLength: 100,
    pattern: "\\S",
    error: "政治面貌须为 1—100 字符且不能全为空格",
  }),
  socialWorkerNo: nullableText(),
  serviceFieldCode: nullableText(),
  proposedTeam: nullableText(),
}
export const password = t.String({ minLength: 8, maxLength: 128, error: "密码须为 8—128 字符" })
/** 组织维护字段：限制编码格式、节点类型、启停状态及排序。 */
export const orgFields = {
  code: t.String({ minLength: 1, maxLength: 32, pattern: "^[a-zA-Z0-9_-]+$" }),
  name: text(),
  parentId: t.Union([id, t.Null()]),
  type: enumOf(orgTypes),
  status: t.Union([t.Literal("ACTIVE"), t.Literal("DISABLED")]),
  sortOrder: t.Integer(),
}
/** 角色资料字段：权限集合使用独立接口维护。 */
export const roleFields = {
  code: t.String({ minLength: 1, maxLength: 32, pattern: "^[a-z][a-z0-9_-]*$" }),
  name: text(),
  description: t.String({ maxLength: 1000 }),
  status: t.Union([t.Literal("ACTIVE"), t.Literal("DISABLED")]),
}
