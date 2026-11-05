<script setup lang="ts">
import { regionText } from '@/api/region-types'
import RegionSelect from '@/components/RegionSelect.vue'
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import ResponsivePagination from '@/components/ResponsivePagination.vue'
import FilterPanel from '@/components/FilterPanel.vue'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { resourceApi } from '@/api/modules/resource'
import {
    emptyResource,
    resourceStatus,
    resourceRelationship,
    type Resource,
    type ResourceCandidates,
    type ResourceInput,
    type LegacyContract,
} from '@/api/resource-types'
import { useTableSort } from '@/utils/tableSort'
import { useMock } from '@/api/config'
import ResourceEditor from './components/ResourceEditor.vue'
const router = useRouter(),
    store = useUserStore()
const rows = ref<Resource[]>([]),
    total = ref(0),
    loading = ref(false),
    busy = ref(false),
    dialog = ref(false)
const candidates = ref<ResourceCandidates>({ resources: [], organizations: [], users: [] })
const model = ref<ResourceInput>(emptyResource()),
    editor = ref<InstanceType<typeof ResourceEditor>>()
const query = reactive({
    page: 1,
    pageSize: 20,
    keyword: '',
    region: '',
    regionCode: undefined as string | null | undefined,
    regionUnmapped: undefined as string | undefined,
    unitType: '',
    capability: '',
    relationship: '',
    status: '',
    overdue: '',
    maintainerId: undefined as number | undefined,
})
const { setTableRef, defaultSort, onSortChange, resetSort } = useTableSort(
    query,
    'createdAt',
    'descending',
    load,
)
const legacy = ref<LegacyContract[]>([]),
    legacyDialog = ref(false),
    legacyResource = ref(0)
let generation = 0
async function load() {
    const seq = ++generation
    if (useMock) return
    loading.value = true
    try {
        const result = await resourceApi.list(
            Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '')),
        )
        if (seq === generation) {
            rows.value = result.list
            total.value = result.total
        }
    } catch {
        /* 请求层提示 */
    } finally {
        if (seq === generation) loading.value = false
    }
}
function search() {
    query.page = 1
    void load()
}
function reset() {
    Object.assign(query, {
        page: 1,
        keyword: '',
        region: '',
        regionCode: undefined,
        regionUnmapped: undefined,
        unitType: '',
        capability: '',
        relationship: '',
        status: '',
        overdue: '',
        maintainerId: undefined,
    })
    resetSort()
    void load()
}
async function create() {
    try {
        candidates.value = await resourceApi.candidates()
        model.value = {
            ...emptyResource(),
            ownerOrgId: store.profile?.orgId ?? 0,
            maintainerId: store.profile?.id ?? 0,
            requestKey: crypto.randomUUID(),
        }
        dialog.value = true
    } catch {
        /* 请求层提示 */
    }
}
async function save() {
    if (busy.value || !(await editor.value?.validate())) return
    busy.value = true
    try {
        const result = await resourceApi.create(model.value)
        dialog.value = false
        await router.push(`/resource/${result.id}`)
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
async function openLegacy() {
    try {
        candidates.value = await resourceApi.candidates()
        legacy.value = await resourceApi.legacy()
        legacyResource.value = 0
        legacyDialog.value = true
    } catch {
        /* 请求层提示 */
    }
}
async function link(row: LegacyContract) {
    if (!legacyResource.value) return void ElMessage.warning('请先选择核对后的单位资源')
    if (busy.value) return
    busy.value = true
    try {
        await resourceApi.link(row.id, legacyResource.value, row.projectVersion)
        legacy.value = await resourceApi.legacy()
        await load()
        ElMessage.success('已关联，原签约名称保留')
    } catch {
        /* 请求层提示 */
    } finally {
        busy.value = false
    }
}
onMounted(async () => {
    await load()
    if (!useMock) {
        try {
            candidates.value = await resourceApi.candidates()
        } catch {
            /* 请求层提示 */
        }
    }
})
</script>
<template>
    <div class="resource-page">
        <el-alert
            v-if="useMock"
            title="资源业务请切换真实接口模式后使用"
            type="info"
            :closable="false"
        />
        <FilterPanel :model="query" inline class="filter-form" @submit.prevent="search">
            <el-form-item label="单位名称">
                <el-input v-model="query.keyword" clearable />
            </el-form-item>
            <el-form-item label="区域">
                <RegionSelect
                    v-model="query.regionCode"
                    @change="query.regionUnmapped = undefined"
                />
            </el-form-item>
            <el-form-item label="区域核对">
                <el-select
                    v-model="query.regionUnmapped"
                    clearable
                    placeholder="全部"
                    @change="query.regionCode = undefined"
                >
                    <el-option label="历史区域待核对" value="1" />
                </el-select>
            </el-form-item>
            <el-form-item label="单位类型">
                <el-input v-model="query.unitType" clearable />
            </el-form-item>
            <el-form-item label="资源能力">
                <el-input v-model="query.capability" clearable />
            </el-form-item>
            <el-form-item label="合作关系">
                <el-select v-model="query.relationship" clearable>
                    <el-option
                        v-for="(label, value) in resourceRelationship"
                        :key="value"
                        :label="label"
                        :value="value"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="档案状态">
                <el-select v-model="query.status" clearable>
                    <el-option
                        v-for="(label, value) in resourceStatus"
                        :key="value"
                        :label="label"
                        :value="value"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="维护人">
                <el-select v-model="query.maintainerId" clearable filterable>
                    <el-option
                        v-for="u in candidates.users"
                        :key="u.id"
                        :value="u.id"
                        :label="u.name"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="逾期跟进">
                <el-select v-model="query.overdue" clearable>
                    <el-option label="有逾期事项" value="1" />
                </el-select>
            </el-form-item>
            <el-form-item class="filter-form__actions">
                <el-button type="primary" native-type="submit">查询</el-button>
                <el-button @click="reset">重置</el-button>
            </el-form-item>
        </FilterPanel>
        <div class="resource-actions">
            <el-button
                v-if="store.hasPermission('resource:record:create')"
                type="primary"
                :disabled="useMock"
                @click="create"
            >
                新增单位资源
            </el-button>
            <el-button
                v-if="store.hasPermission('project:record:update')"
                :disabled="useMock"
                @click="openLegacy"
            >
                历史合同核对
            </el-button>
        </div>
        <ResponsiveTable
            :ref="setTableRef"
            v-loading="loading"
            :data="rows"
            :default-sort="defaultSort"
            @sort-change="onSortChange"
        >
            <el-table-column prop="name" label="单位名称" min-width="190" sortable="custom">
                <template #default="{ row }">
                    <el-link type="primary" @click="router.push(`/resource/${row.id}`)">
                        {{ row.name }}
                    </el-link>
                </template>
            </el-table-column>
            <el-table-column prop="region" label="区域" min-width="180">
                <template #default="{ row }">{{ regionText(row, row.region) }}</template>
            </el-table-column>
            <el-table-column prop="unitType" label="单位类型" min-width="110" />
            <el-table-column label="资源能力" min-width="150">
                <template #default="{ row }">{{ row.capabilityCodes.join('、') || '—' }}</template>
            </el-table-column>
            <el-table-column prop="maintainerName" label="维护人" width="110" />
            <el-table-column label="合作关系" width="110">
                <template #default="{ row }">{{ resourceRelationship[row.relationship] }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
                <template #default="{ row }">{{ resourceStatus[row.status] }}</template>
            </el-table-column>
            <el-table-column prop="overdue" label="逾期跟进" width="115" sortable="custom" />
        </ResponsiveTable>
        <ResponsivePagination
            v-model:current-page="query.page"
            v-model:page-size="query.pageSize"
            :total="total"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @current-change="load"
            @size-change="search"
        />
        <el-dialog
            v-model="dialog"
            title="新增单位资源"
            width="680px"
            :close-on-click-modal="false"
        >
            <ResourceEditor
                ref="editor"
                v-model="model"
                :candidates="candidates"
                :disabled="busy"
            />
            <template #footer>
                <el-button :disabled="busy" @click="dialog = false">取消</el-button>
                <el-button type="primary" :loading="busy" @click="save">保存</el-button>
            </template>
        </el-dialog>
        <el-dialog v-model="legacyDialog" title="历史合同核对" width="850px">
            <p>核对单位身份后关联；原签约名称保留。</p>
            <el-select v-model="legacyResource" filterable placeholder="选择核对后的单位">
                <el-option
                    v-for="r in candidates.resources"
                    :key="r.id"
                    :value="r.id"
                    :label="`${r.name}（${r.region}）`"
                />
            </el-select>
            <!-- @vue-generic {LegacyContract} -->
            <ResponsiveTable :data="legacy">
                <el-table-column prop="projectName" label="合同包" />
                <el-table-column prop="partnerName" label="原签约名称" />
                <el-table-column label="操作" width="100">
                    <template #default="{ row }">
                        <el-button :loading="busy" @click="link(row as LegacyContract)">
                            确认关联
                        </el-button>
                    </template>
                </el-table-column>
            </ResponsiveTable>
        </el-dialog>
    </div>
</template>
<style scoped>
.resource-page {
    padding: 20px;
}
.resource-actions {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
}
.el-pagination {
    margin-top: 16px;
}
.filter-form :deep(.el-select) {
    width: 170px;
}
@media (max-width: 767px) {
    .resource-page {
        padding: 0;
    }
    .resource-actions {
        flex-wrap: wrap;
    }
    .filter-form :deep(.el-select) {
        width: 100%;
    }
}
</style>
