import { shallowRef } from 'vue'
import type { TableInstance } from 'element-plus'

export interface SortQuery {
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    page?: number
}
export interface SortEvent {
    prop: string | null
    order: 'ascending' | 'descending' | null
}

/** 同步表头与接口参数；取消排序恢复默认，重置只改状态，由页面统一查询。 */
export function useTableSort(
    query: SortQuery,
    prop: string,
    order: 'ascending' | 'descending',
    reload: () => unknown,
) {
    const tableRef = shallowRef<TableInstance>()
    const defaultSort = { prop, order }
    const defaultOrder = order === 'ascending' ? 'asc' : 'desc'
    let syncing = false
    query.sortBy = prop
    query.sortOrder = defaultOrder

    function setTableRef(instance: unknown) {
        tableRef.value = (instance ?? undefined) as TableInstance | undefined
    }
    function syncHeader() {
        syncing = true
        try {
            tableRef.value?.sort(prop, order)
        } finally {
            syncing = false
        }
    }
    function resetSort() {
        query.sortBy = prop
        query.sortOrder = defaultOrder
        if ('page' in query) query.page = 1
        syncHeader()
    }
    function onSortChange(event: SortEvent) {
        if (syncing) return
        const nextProp = event.order && event.prop ? event.prop : prop
        const nextOrder = event.order === 'ascending' ? 'asc' : event.order ? 'desc' : defaultOrder
        const changed = query.sortBy !== nextProp || query.sortOrder !== nextOrder
        query.sortBy = nextProp
        query.sortOrder = nextOrder
        if (!event.order) syncHeader()
        if (changed) {
            if ('page' in query) query.page = 1
            void reload()
        }
    }
    return { setTableRef, defaultSort, onSortChange, resetSort }
}

const collator = new Intl.Collator('zh-CN', { numeric: true })
type Rule = readonly [string, 'asc' | 'desc']

/** 完整加载的小表排序：中文名称按拼音，日期按时刻，小数按百分位整数，空值置后。 */
export function sortTableRows<T extends { id: number }>(
    rows: T[],
    query: SortQuery,
    defaults: readonly Rule[] = [
        ['createdAt', 'desc'],
        ['id', 'desc'],
    ],
    decimalFields: string[] = [],
): T[] {
    const rules: readonly Rule[] =
        query.sortBy && query.sortOrder
            ? [[query.sortBy, query.sortOrder], ...defaults.filter(([key]) => key !== query.sortBy)]
            : defaults
    const value = (row: T, key: string) => {
        const raw = row[key as keyof T]
        if (raw == null) return null
        if (decimalFields.includes(key)) {
            const [whole = '0', fraction = ''] = String(raw).split('.')
            return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
        }
        if (key === 'createdAt') return new Date(String(raw)).getTime()
        return typeof raw === 'number' ? raw : String(raw)
    }
    return [...rows].sort((a, b) => {
        for (const [key, direction] of rules) {
            const left = value(a, key),
                right = value(b, key)
            if (left == null || right == null) {
                if (left == null && right == null) continue
                return left == null ? 1 : -1
            }
            const result =
                typeof left === 'string' && typeof right === 'string'
                    ? collator.compare(left, right)
                    : left < right
                      ? -1
                      : left > right
                        ? 1
                        : 0
            if (result) return direction === 'asc' ? result : -result
        }
        return 0
    })
}
