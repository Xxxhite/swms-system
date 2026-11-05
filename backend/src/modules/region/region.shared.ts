import type { RegionPathItem, administrativeRegions } from "@/db/schema/region"
import { AppError } from "@/utils/errors"
export type Region = typeof administrativeRegions.$inferSelect
export interface RegionAddress {
  regionCode?: string | null
  regionPathSnapshot?: RegionPathItem[] | null
}
export function regionPath(rows: Region[], code: string, active = false): Region[] {
  const path: Region[] = [],
    seen = new Set<string>()
  let current: string | null = code
  while (current) {
    if (seen.has(current)) throw AppError.conflict("地区层级存在循环")
    seen.add(current)
    const row = rows.find((r) => r.code === current)
    if (!row || (active && !row.enabled)) throw AppError.badRequest("请选择有效地区")
    path.unshift(row)
    current = row.parentCode
  }
  if (path.some((r, i) => r.level !== i + 1) || path.length > 3)
    throw AppError.conflict("地区层级不完整")
  return path
}
export function regionAddress(
  rows: Region[],
  input: { regionCode?: string | null },
  old: RegionAddress | undefined,
  textChanged: boolean,
  terminal = false,
) {
  const code = input.regionCode
  if (!code) {
    if (old && !textChanged && (code === undefined || !old.regionCode))
      return {
        regionCode: old.regionCode ?? null,
        regionPathSnapshot: old.regionPathSnapshot ?? null,
      }
    throw AppError.badRequest("请选择地区")
  }
  if (old?.regionCode === code && !textChanged)
    return {
      regionCode: code,
      regionPathSnapshot:
        old.regionPathSnapshot ?? regionPath(rows, code).map(({ code, name }) => ({ code, name })),
    }
  const path = regionPath(rows, code, true)
  if (terminal && rows.some((r) => r.parentCode === code && r.enabled))
    throw AppError.badRequest("请选择具体区县或服务区域")
  return { regionCode: code, regionPathSnapshot: path.map(({ code, name }) => ({ code, name })) }
}
export function regionDisplay(value: RegionAddress | null | undefined, legacy = "") {
  return value?.regionPathSnapshot?.map((r) => r.name).join(" / ") || legacy
}
export function regionMatches(
  rows: Region[],
  selected: string | undefined,
  value: RegionAddress | null | undefined,
  coverage = false,
) {
  if (!selected) return true
  const selectedPath = regionPath(rows, selected).map((r) => r.code)
  if (!value?.regionCode) return false
  const actualPath = regionPath(rows, value.regionCode).map((r) => r.code)
  return actualPath.includes(selected) || (coverage && selectedPath.includes(value.regionCode))
}
export function validateRegionQuery(
  rows: Region[],
  q: { regionCode?: string; regionUnmapped?: string },
  legacy?: string,
) {
  if (q.regionCode && (legacy || q.regionUnmapped))
    throw AppError.badRequest("地区代码与历史区域条件不能同时筛选")
  if (q.regionCode) regionPath(rows, q.regionCode)
}
export function regionTree(rows: Region[]) {
  type Node = Region & { children: Node[] }
  const map = new Map(
    rows.filter((r) => r.enabled).map((r) => [r.code, { ...r, children: [] } as Node]),
  )
  const roots: Node[] = []
  for (const row of map.values()) {
    if (row.parentCode) map.get(row.parentCode)?.children.push(row)
    else roots.push(row)
  }
  const sort = (nodes: Node[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    nodes.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}
