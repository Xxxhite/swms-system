<script setup lang="ts" generic="T extends object">
import {
    Comment,
    Fragment,
    defineComponent,
    h,
    ref,
    useAttrs,
    useSlots,
    type VNode,
    type Slots,
    watch,
    nextTick,
} from 'vue'
import type { TableInstance } from 'element-plus'
import type { SortEvent } from '@/utils/tableSort'
import { useViewport } from '@/composables/useViewport'
defineOptions({ inheritAttrs: false })
const props = withDefaults(
    defineProps<{
        data?: T[]
        mobileCards?: boolean
        defaultSort?: { prop: string; order: 'ascending' | 'descending' }
    }>(),
    { data: () => [], mobileCards: true },
)
const emit = defineEmits<{ 'sort-change': [event: SortEvent] }>()
const attrs = useAttrs(),
    slots = useSlots(),
    table = ref<TableInstance>(),
    { isMobile } = useViewport()
const sorting = ref<SortEvent>({
    prop: props.defaultSort?.prop ?? null,
    order: props.defaultSort?.order ?? null,
})
function sort(prop: string, order: 'ascending' | 'descending') {
    table.value?.sort(prop, order)
}
function clearSort() {
    table.value?.clearSort()
}
function changed(event: SortEvent) {
    sorting.value = { prop: event.prop, order: event.order }
    emit('sort-change', event)
}
defineExpose({ sort, clearSort })
watch(isMobile, () => {
    void nextTick(() => table.value?.doLayout())
})
function columns(nodes: VNode[]): VNode[] {
    return nodes.flatMap((node) => {
        if (node.type === Comment) return []
        if (node.type === Fragment) return columns((node.children ?? []) as VNode[])
        if (node.props?.type === 'selection') return []
        return typeof node.type === 'object' || typeof node.type === 'function' ? [node] : []
    })
}
function valueAt(row: T, path: string) {
    return path
        .split('.')
        .reduce<unknown>(
            (value, key) =>
                value && typeof value === 'object'
                    ? (value as Record<string, unknown>)[key]
                    : undefined,
            row,
        )
}
function content(column: VNode, row: T, index: number) {
    const cell =
        column.children && typeof column.children === 'object' && !Array.isArray(column.children)
            ? (column.children as Slots).default
            : undefined
    if (cell) return cell({ row, $index: index, column: column.props ?? {} })
    if (column.props?.type === 'index') return String(index + 1)
    const value = valueAt(row, String(column.props?.prop ?? ''))
    return value == null || value === '' ? '—' : String(value)
}
const MobileRecords = defineComponent({
    name: 'MobileTableRecords',
    setup() {
        return () => {
            const fields = columns(slots.default?.() ?? [])
            const sortable = fields.filter((c) => c.props?.sortable && c.props?.prop)
            const selected = sortable.some((c) => c.props?.prop === sorting.value.prop)
                ? (sorting.value.prop ?? '')
                : ''
            const controls = sortable.length
                ? h('div', { class: 'mobile-table__sort' }, [
                      h('label', [
                          '排序 ',
                          h(
                              'select',
                              {
                                  value: selected,
                                  'aria-label': '排序字段',
                                  onChange: (e: Event) => {
                                      const prop = (e.target as HTMLSelectElement).value
                                      if (prop) sort(prop, sorting.value.order ?? 'descending')
                                      else clearSort()
                                  },
                              },
                              [
                                  h('option', { value: '' }, '默认排序'),
                                  ...sortable.map((c) =>
                                      h('option', { value: c.props!.prop }, String(c.props!.label)),
                                  ),
                              ],
                          ),
                      ]),
                      h('label', [
                          '顺序 ',
                          h(
                              'select',
                              {
                                  value: sorting.value.order ?? 'descending',
                                  'aria-label': '排序顺序',
                                  onChange: (e: Event) => {
                                      if (sorting.value.prop)
                                          sort(
                                              sorting.value.prop,
                                              (e.target as HTMLSelectElement).value as
                                                  'ascending' | 'descending',
                                          )
                                  },
                              },
                              [
                                  h('option', { value: 'ascending' }, '升序'),
                                  h('option', { value: 'descending' }, '降序'),
                              ],
                          ),
                      ]),
                  ])
                : null
            return h('div', { class: 'mobile-table' }, [
                controls,
                ...props.data.map((row, index) =>
                    h(
                        'article',
                        {
                            class: 'mobile-record-card',
                            key: (row as { id?: number }).id ?? index,
                            'aria-label': `记录 ${index + 1}`,
                        },
                        [
                            h(
                                'dl',
                                fields.map((column, colIndex) =>
                                    column.props?.type === 'expand'
                                        ? h(
                                              'div',
                                              {
                                                  class: 'mobile-record-card__expand',
                                                  key: colIndex,
                                              },
                                              [
                                                  h('details', [
                                                      h('summary', '展开记录'),
                                                      h('div', content(column, row, index)),
                                                  ]),
                                              ],
                                          )
                                        : h(
                                              'div',
                                              {
                                                  class: [
                                                      'mobile-record-card__field',
                                                      {
                                                          'is-actions':
                                                              column.props?.label === '操作',
                                                      },
                                                  ],
                                                  key: colIndex,
                                              },
                                              [
                                                  h(
                                                      'dt',
                                                      String(
                                                          column.props?.label ??
                                                              (column.props?.type === 'index'
                                                                  ? '序号'
                                                                  : '记录'),
                                                      ),
                                                  ),
                                                  h('dd', content(column, row, index)),
                                              ],
                                          ),
                                ),
                            ),
                        ],
                    ),
                ),
                !props.data.length
                    ? h(
                          'p',
                          { class: 'mobile-table__empty' },
                          String(attrs['empty-text'] ?? '暂无数据'),
                      )
                    : null,
            ])
        }
    },
})
</script>
<template>
    <div class="responsive-table" :class="$attrs.class">
        <el-table
            ref="table"
            v-bind="{ ...$attrs, class: undefined }"
            v-show="!isMobile || !mobileCards"
            :data="props.data"
            :default-sort="props.defaultSort"
            @sort-change="changed"
        >
            <slot />
        </el-table>
        <MobileRecords v-if="isMobile && mobileCards" />
        <p v-if="isMobile && !mobileCards" class="responsive-table__hint">左右滑动查看完整内容</p>
    </div>
</template>
