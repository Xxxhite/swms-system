<script setup lang="ts">
import { useViewport } from '@/composables/useViewport'
defineOptions({ inheritAttrs: false })
const page = defineModel<number>('currentPage', { default: 1 })
const size = defineModel<number>('pageSize', { default: 20 })
const props = withDefaults(
    defineProps<{ total: number; pageSizes?: number[]; layout?: string }>(),
    {
        pageSizes: () => [10, 20, 50, 100],
        layout: 'total, sizes, prev, pager, next',
    },
)
const emit = defineEmits<{ 'current-change': [page: number]; 'size-change': [size: number] }>()
const { isMobile } = useViewport()
function changeSize(event: Event) {
    size.value = Number((event.target as HTMLSelectElement).value)
    emit('size-change', size.value)
}
</script>
<template>
    <div class="responsive-pagination" :class="$attrs.class">
        <el-pagination
            v-bind="{ ...$attrs, class: undefined }"
            v-model:current-page="page"
            v-model:page-size="size"
            :total="props.total"
            :page-sizes="props.pageSizes"
            :pager-count="7"
            :layout="isMobile ? 'prev, jumper, next' : props.layout"
            @current-change="emit('current-change', $event)"
            @size-change="emit('size-change', $event)"
        />
        <div v-if="isMobile" class="responsive-pagination__meta">
            <span>共 {{ props.total }} 条 · 第 {{ page }} 页</span>
            <label>
                每页
                <select :value="size" aria-label="每页条数" @change="changeSize">
                    <option v-for="count in props.pageSizes" :key="count" :value="count">
                        {{ count }}条
                    </option>
                </select>
            </label>
        </div>
    </div>
</template>
