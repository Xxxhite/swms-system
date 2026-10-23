import { t, type Static } from "elysia"
import { sortFields } from "@/utils/list-sort"
export const idParam = t.Object({ id: t.Numeric({ minimum: 1, multipleOf: 1 }) })
export const versionBody = t.Object({ version: t.Integer({ minimum: 1 }) })
/** 必填业务文本的字段提示，避免将框架校验详情暴露给调用方。 */
export const shortText = (maxLength: number, label = "内容") =>
  t.String({
    minLength: 1,
    maxLength,
    pattern: "\\S",
    error: `${label}不能为空且最多 ${maxLength} 个字符`,
  })
/** 数量统一使用十进制字符串，目标大于零的约束继续由业务层确认。 */
export const quantity = t.String({
  pattern: "^(0|[1-9][0-9]{0,9})(\\.[0-9]{1,2})?$",
  error: "数量须为非负数，整数最多 10 位、小数最多 2 位",
})
export const projectBody = t.Object({
  code: t.String({
    pattern: "^[a-zA-Z0-9_-]{1,32}$",
    error: "项目编码须为 1—32 位字母、数字、下划线或连字符",
  }),
  name: shortText(150, "项目名称"),
  category: t.Union([t.Literal("CONTRACT_PACKAGE"), t.Literal("HEADQUARTERS"), t.Literal("FUND")], {
    error: "请选择有效的项目分类",
  }),
  ownerOrgId: t.Integer({ minimum: 1, error: "请选择归属组织" }),
  directorId: t.Integer({ minimum: 1, error: "请选择项目总监" }),
  supervisorId: t.Integer({ minimum: 1, error: "请选择高级主任 / 督导" }),
  serviceFieldCode: shortText(100, "主服务领域"),
})
export const contractBody = t.Object({
  contractNo: t.Optional(t.String({ maxLength: 100 })),
  partnerName: shortText(150, "合作方"),
  startDate: t.String({ format: "date", error: "请选择有效的合同开始日期" }),
  endDate: t.String({ format: "date", error: "请选择有效的合同结束日期" }),
  amount: t.String({
    pattern: "^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,2})?$",
    error: "合同金额须为非负数，整数最多 12 位、小数最多 2 位",
  }),
  serviceArea: shortText(100, "服务区域"),
  note: t.Optional(t.String({ maxLength: 5000 })),
})
export const teamBody = t.Array(
  t.Object({ teamId: t.Integer({ minimum: 1 }), reporterId: t.Integer({ minimum: 1 }) }),
  { maxItems: 100 },
)
export const pointBody = t.Array(
  t.Object({
    id: t.Optional(t.Integer({ minimum: 1 })),
    name: shortText(100, "服务点名称"),
    address: t.Optional(t.String({ maxLength: 255 })),
    note: t.Optional(t.String({ maxLength: 1000 })),
  }),
  { maxItems: 100 },
)
export const indicatorBody = t.Object({
  name: shortText(150, "指标名称"),
  unit: shortText(20, "单位"),
  definition: shortText(5000, "统计口径"),
  targetValue: quantity,
})
export const allocationBody = t.Array(
  t.Object({ teamId: t.Integer({ minimum: 1 }), targetValue: quantity }),
  { maxItems: 100 },
)
export const listQuery = t.Object({
  ...sortFields,
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
  keyword: t.Optional(t.String({ maxLength: 150 })),
  category: t.Optional(t.String({ maxLength: 32 })),
  status: t.Optional(t.String({ maxLength: 32 })),
  serviceFieldCode: t.Optional(t.String({ maxLength: 100 })),
  serviceArea: t.Optional(t.String({ maxLength: 100 })),
  teamId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  projectId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  indicatorId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  month: t.Optional(t.String({ pattern: "^\\d{4}-(0[1-9]|1[0-2])$" })),
  asOfDate: t.Optional(t.String({ format: "date" })),
  warningLevel: t.Optional(t.String({ maxLength: 10 })),
  dateFrom: t.Optional(t.String({ format: "date" })),
  dateTo: t.Optional(t.String({ format: "date" })),
})
export type ProjectInput = Static<typeof projectBody>
export type ContractInput = Static<typeof contractBody>
export type IndicatorInput = Static<typeof indicatorBody>
export type AllocationInput = Static<typeof allocationBody>
export type BusinessQuery = Static<typeof listQuery>
/** 所有列表使用统一分页结构，数据在裁剪范围后再分页。 */
export function pageResult<T>(rows: T[], query: BusinessQuery) {
  const page = query.page ?? 1,
    pageSize = query.pageSize ?? 20
  return {
    list: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
  }
}
