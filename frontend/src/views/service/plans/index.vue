<script setup lang="ts">
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import ResponsivePagination from '@/components/ResponsivePagination.vue'
import FilterPanel from '@/components/FilterPanel.vue'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { planApi } from '@/api/modules/plan'
import { taskApi } from '@/api/modules/task'
import { emptyCandidates, type Plan } from '@/api/task-types'
import { PERM } from '@/api/permissions'
import { useMock } from '@/api/config'
import { useUserStore } from '@/stores/user'
import PlanDialog from './components/PlanDialog.vue'
const router = useRouter(),
    store = useUserStore(),
    rows = ref<Plan[]>([]),
    total = ref(0),
    loading = ref(false),
    dialog = ref(false),
    candidates = ref(emptyCandidates())
const query = reactive({
    page: 1,
    pageSize: 20,
    projectId: undefined as number | undefined,
    teamId: undefined as number | undefined,
    status: '',
})
let generation = 0
async function load() {
    const seq = ++generation
    if (useMock) return
    loading.value = true
    try {
        const result = await planApi.list(
            Object.fromEntries(
                Object.entries(query).filter(([, v]) => v !== '' && v !== undefined),
            ),
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
    Object.assign(query, { page: 1, projectId: undefined, teamId: undefined, status: '' })
    search()
}
onMounted(async () => {
    void load()
    if (!useMock)
        try {
            candidates.value = await taskApi.candidates()
        } catch {
            /* 请求层提示 */
        }
})
</script>
<template>
    <section>
        <div class="plan-list__header">
            <h2>阶段计划</h2>
            <el-button
                v-if="store.hasPermission(PERM.PLAN_MANAGE)"
                type="primary"
                :disabled="useMock"
                @click="dialog = true"
            >
                新增阶段计划
            </el-button>
        </div>
        <el-alert
            v-if="useMock"
            title="演示模式展示计划入口；阶段计划使用真实接口维护。"
            type="info"
            :closable="false"
        />
        <FilterPanel :inline="true" class="filter-form" @submit.prevent="search">
            <el-form-item label="合同包">
                <el-select v-model="query.projectId" clearable @change="query.teamId = undefined">
                    <el-option
                        v-for="p in candidates.projects"
                        :key="p.id"
                        :label="p.name"
                        :value="p.id"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="团队">
                <el-select v-model="query.teamId" clearable>
                    <el-option
                        v-for="t in candidates.teams.filter(
                            (t) => !query.projectId || t.projectId === query.projectId,
                        )"
                        :key="`${t.projectId}-${t.teamId}`"
                        :label="t.name"
                        :value="t.teamId"
                    />
                </el-select>
            </el-form-item>
            <el-form-item label="发布状态">
                <el-select v-model="query.status" clearable>
                    <el-option label="草稿" value="DRAFT" />
                    <el-option label="已发布" value="PUBLISHED" />
                </el-select>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" native-type="submit">查询</el-button>
                <el-button @click="reset">重置</el-button>
            </el-form-item>
        </FilterPanel>
        <ResponsiveTable v-loading="loading" :data="rows" stripe>
            <el-table-column label="指标" min-width="180">
                <template #default="{ row }">
                    <el-link type="primary" @click="router.push(`/service/plans/${row.id}`)">
                        {{ row.indicatorName }}
                    </el-link>
                </template>
            </el-table-column>
            <el-table-column prop="projectName" label="合同包" min-width="180" />
            <el-table-column prop="teamName" label="团队" min-width="130" />
            <el-table-column label="版本" width="80">
                <template #default="{ row }">第{{ row.revision }}版</template>
            </el-table-column>
            <el-table-column label="分解方式" width="100">
                <template #default="{ row }">
                    {{ row.mode === 'MONTHLY' ? '月度' : '里程碑' }}
                </template>
            </el-table-column>
            <el-table-column prop="targetValue" label="目标量" width="100" />
            <el-table-column prop="effectiveDate" label="生效日" width="120" />
            <el-table-column label="状态" width="180">
                <template #default="{ row }">
                    <el-tag :type="row.status === 'PUBLISHED' ? 'success' : 'info'">
                        {{ row.status === 'PUBLISHED' ? '已发布' : '草稿' }}
                    </el-tag>
                    <el-tag v-if="row.stale" type="warning">目标已变更</el-tag>
                </template>
            </el-table-column>
        </ResponsiveTable>
        <ResponsivePagination
            v-model:current-page="query.page"
            v-model:page-size="query.pageSize"
            :total="total"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @size-change="search"
            @current-change="load"
        />
        <PlanDialog v-model="dialog" @saved="(id) => router.push(`/service/plans/${id}`)" />
    </section>
</template>
<style scoped>
.plan-list__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
</style>
