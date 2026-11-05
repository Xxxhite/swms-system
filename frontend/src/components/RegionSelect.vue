<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { regionApi } from '@/api/modules/region'
import type { RegionNode } from '@/api/region-types'
const value = defineModel<string | null | undefined>()
withDefaults(defineProps<{ disabled?: boolean; terminal?: boolean; legacy?: string }>(), {
    disabled: false,
    terminal: false,
    legacy: '',
})
const emit = defineEmits<{ change: [value: string | null] }>()
const tree = ref<RegionNode[]>([]),
    province = ref(''),
    city = ref(''),
    district = ref(''),
    loading = ref(false),
    failed = ref(false)
const cities = computed(() => tree.value.find((n) => n.code === province.value)?.children ?? [])
const districts = computed(() => cities.value.find((n) => n.code === city.value)?.children ?? [])
function find(
    code: string,
    nodes: RegionNode[],
    path: RegionNode[] = [],
): RegionNode[] | undefined {
    for (const n of nodes) {
        if (n.code === code) return [...path, n]
        const match = find(code, n.children, [...path, n])
        if (match) return match
    }
    return undefined
}
function sync() {
    const path = value.value ? find(value.value, tree.value) : undefined
    province.value = path?.[0]?.code ?? ''
    city.value = path?.[1]?.code ?? ''
    district.value = path?.[2]?.code ?? ''
}
function changed(level: number) {
    if (level === 1) {
        city.value = ''
        district.value = ''
    }
    if (level === 2) district.value = ''
    value.value = district.value || city.value || province.value || undefined
    emit('change', value.value ?? null)
}
async function load() {
    loading.value = true
    failed.value = false
    try {
        tree.value = (await regionApi.tree()).tree
        sync()
    } catch {
        failed.value = true
    } finally {
        loading.value = false
    }
}
watch(value, sync)
onMounted(load)
</script>
<template>
    <div class="region-select">
        <div class="region-select__fields">
            <el-select
                v-model="province"
                :disabled="disabled"
                :loading="loading"
                filterable
                clearable
                placeholder="省／自治区／直辖市"
                aria-label="省份"
                @change="changed(1)"
            >
                <el-option v-for="p in tree" :key="p.code" :label="p.name" :value="p.code" />
            </el-select>
            <el-select
                v-model="city"
                :disabled="disabled || !province"
                filterable
                clearable
                placeholder="城市"
                aria-label="城市"
                @change="changed(2)"
            >
                <el-option v-for="c in cities" :key="c.code" :label="c.name" :value="c.code" />
            </el-select>
            <el-select
                v-model="district"
                :disabled="disabled || !city || !districts.length"
                filterable
                clearable
                :placeholder="city && !districts.length ? '无区县层级' : '区县／服务区域'"
                aria-label="区县或服务区域"
                @change="changed(3)"
            >
                <el-option
                    v-for="d in districts"
                    :key="d.code"
                    :label="d.name + (d.kind === 'SERVICE' ? '（服务区域）' : '')"
                    :value="d.code"
                />
            </el-select>
        </div>
        <span v-if="legacy && !value" class="region-select__hint">
            历史区域待核对：{{ legacy }}
        </span>
        <span v-else-if="value && !province && !loading && !failed" class="region-select__hint">
            历史地区：{{ legacy || value }}（新选择请使用已启用地区）
        </span>
        <span v-if="terminal && city && districts.length && !district" class="region-select__hint">
            请选择区县／服务区域
        </span>
        <div v-if="failed" class="region-select__hint">
            地区加载失败
            <el-button link type="primary" @click="load">重试</el-button>
        </div>
    </div>
</template>
<style scoped>
.region-select {
    width: 100%;
    min-width: 0;
}
.region-select__fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}
.region-select__hint {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    line-height: 1.6;
}
@media (max-width: 767px) {
    .region-select__fields {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
