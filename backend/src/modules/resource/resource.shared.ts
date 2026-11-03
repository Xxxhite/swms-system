import { t } from "elysia"
import { sortFields } from "@/utils/list-sort"
export const shortText = (length: number, label = "内容") =>
  t.String({
    minLength: 1,
    maxLength: length,
    pattern: "\\S",
    error: `${label}不能为空且最多${length}个字符`,
  })
export const listQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
  keyword: t.Optional(t.String({ maxLength: 150 })),
  status: t.Optional(t.String({ maxLength: 30 })),
  ...sortFields,
})
