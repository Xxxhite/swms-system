import { t } from "elysia"
import { AppError } from "./errors"

export interface SortQuery {
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

/** 排序参数只接受字段名和方向，具体字段由每个列表的白名单决定。 */
export const sortFields = {
  sortBy: t.Optional(t.String({ minLength: 1, maxLength: 40 })),
  sortOrder: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
}

/** 验证成对参数与端点白名单，返回可信字段键，禁止把用户字段直接拼接进 SQL。 */
export function resolveSort(query: SortQuery, fields: object, fallback: string) {
  if (Boolean(query.sortBy) !== Boolean(query.sortOrder))
    throw AppError.badRequest("排序字段和方向须同时提供")
  const key = query.sortBy ?? fallback
  if (!Object.hasOwn(fields, key)) throw AppError.badRequest("不支持此排序字段")
  if (query.sortOrder && !["asc", "desc"].includes(query.sortOrder))
    throw AppError.badRequest("排序方向须为 asc 或 desc")
  return key
}

type Value = string | number | bigint | Date | null | undefined
type Rule = readonly [string, "asc" | "desc"]
const collator = new Intl.Collator("zh-CN", { numeric: true })

/** 数量以百分位整数比较，累计值再大也不会因浮点转换损失精度。 */
export function sortDecimal(value: string | null | undefined): bigint | null {
  if (value == null) return null
  const [whole, fraction = ""] = value.split(".")
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))
}

/** 在授权过滤之后、分页之前排序；空值始终置后，默认规则提供稳定补序。 */
export function sortRows<T>(
  rows: T[],
  query: SortQuery,
  fields: Record<string, (row: T) => Value>,
  defaults: readonly Rule[],
): T[] {
  const key = resolveSort(query, fields, defaults[0][0])
  const rules: readonly Rule[] = query.sortBy
    ? [[key, query.sortOrder!], ...defaults.filter(([field]) => field !== key)]
    : defaults
  return [...rows].sort((a, b) => {
    for (const [field, direction] of rules) {
      const left = fields[field](a),
        right = fields[field](b)
      if (left == null || right == null) {
        if (left == null && right == null) continue
        return left == null ? 1 : -1
      }
      const x = left instanceof Date ? left.getTime() : left
      const y = right instanceof Date ? right.getTime() : right
      const result =
        typeof x === "string" && typeof y === "string"
          ? collator.compare(x, y)
          : x < y
            ? -1
            : x > y
              ? 1
              : 0
      if (result) return direction === "asc" ? result : -result
    }
    return 0
  })
}
