<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { analysisApi } from '@/api/modules/analysis'
import { projectApi } from '@/api/modules/project'
import { resourceApi } from '@/api/modules/resource'
import { useMock } from '@/api/config'
import { useUserStore } from '@/stores/user'
import { feedbackRatings, type QualityKind, type QualityReport } from '@/api/feedback-types'
import FilterPanel from '@/components/FilterPanel.vue'
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import ResponsivePagination from '@/components/ResponsivePagination.vue'
const store = useUserStore(),
    kind = ref<QualityKind>('service'),
    data = ref<QualityReport>(),
    loading = ref(false),
    failed = ref(false),
    exporting = ref(false)
const projects = ref<{ id: number; name: string }[]>([]),
    teams = ref<{ id: number; name: string }[]>([]),
    resources = ref<{ id: number; name: string }[]>([])
const query = reactive({
    projectId: undefined as number | undefined,
    teamId: undefined as number | undefined,
    resourceId: undefined as number | undefined,
    dateFrom: '',
    dateTo: '',
    keyword: '',
    relationship: '',
    rating: '',
    page: 1,
    pageSize: 20,
})
function params() {
    return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v !== undefined))
}
const snapshot = ref<Record<string, unknown>>({})
let generation = 0
const dirty = computed(() => JSON.stringify(params()) !== JSON.stringify(snapshot.value))
const available = computed(() =>
    kind.value === 'service'
        ? store.hasPermission('service:feedback:view') &&
          store.hasPermission('service:execution:view')
        : store.hasPermission('resource:view'),
)
async function load() {
    const current = ++generation
    loading.value = true
    failed.value = false
    const sent = params()
    try {
        const result = await analysisApi.quality(kind.value, sent)
        if (current === generation) {
            data.value = result
            snapshot.value = sent
        }
    } catch {
        if (current === generation) {
            failed.value = true
            data.value = undefined
        }
    } finally {
        if (current === generation) loading.value = false
    }
}
function search() {
    query.page = 1
    void load()
}
function reset() {
    Object.assign(query, {
        projectId: undefined,
        teamId: undefined,
        resourceId: undefined,
        dateFrom: '',
        dateTo: '',
        keyword: '',
        relationship: '',
        rating: '',
        page: 1,
    })
    void load()
}
async function download() {
    if (!data.value || exporting.value) return
    exporting.value = true
    try {
        const blob = await analysisApi.qualityExport(kind.value, {
            ...snapshot.value,
            fingerprint: data.value.meta.fingerprint,
        })
        const url = URL.createObjectURL(blob),
            a = document.createElement('a')
        a.href = url
        a.download = `${data.value.title}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
    } catch {
        /* 请求层提示刷新 */
    } finally {
        exporting.value = false
    }
}
watch(kind, reset)
onMounted(async () => {
    if (!available.value && store.hasPermission('resource:view')) kind.value = 'cooperation'
    if (!useMock) {
        try {
            const p = await projectApi.filterOptions()
            projects.value = p.projects ?? []
            teams.value = p.organizations
        } catch {
            /* 请求层提示 */
        }
        if (store.hasPermission('resource:view'))
            try {
                resources.value = (await resourceApi.candidates()).resources
            } catch {
                /* 请求层提示 */
            }
    }
    await load()
})
</script>
<template>
    <el-radio-group v-model="kind">
        <el-radio-button v-if="store.hasPermission('service:feedback:view')" value="service">
            服务反馈
        </el-radio-button>
        <el-radio-button v-if="store.hasPermission('resource:view')" value="cooperation">
            合作评价
        </el-radio-button>
    </el-radio-group>
    <template v-if="available">
        <FilterPanel @submit.prevent="search">
            <el-form-item label="项目">
                <el-select v-model="query.projectId" clearable filterable>
                    <el-option v-for="p in projects" :key="p.id" :value="p.id" :label="p.name" />
                </el-select>
            </el-form-item>
            <el-form-item v-if="kind === 'service'" label="团队">
                <el-select v-model="query.teamId" clearable>
                    <el-option v-for="t in teams" :key="t.id" :value="t.id" :label="t.name" />
                </el-select>
            </el-form-item>
            <el-form-item v-if="kind === 'service'" label="实际服务日期起">
                <el-date-picker v-model="query.dateFrom" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item v-if="kind === 'service'" label="实际服务日期止">
                <el-date-picker v-model="query.dateTo" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item v-if="kind === 'cooperation'" label="资源">
                <el-select v-model="query.resourceId" clearable filterable>
                    <el-option v-for="r in resources" :key="r.id" :value="r.id" :label="r.name" />
                </el-select>
            </el-form-item>
            <el-form-item v-if="kind === 'cooperation'" label="合作关系">
                <el-select v-model="query.relationship" clearable>
                    <el-option label="正在合作" value="CURRENT" />
                    <el-option label="历史合作" value="HISTORICAL" />
                </el-select>
            </el-form-item>
            <el-form-item v-if="kind === 'cooperation'" label="评价等级">
                <el-select v-model="query.rating" clearable>
                    <el-option
                        v-for="(label, key) in feedbackRatings"
                        :key="key"
                        :label="label"
                        :value="key"
                    />
                    <el-option label="未评价" value="UNRATED" />
                </el-select>
            </el-form-item>
            <el-form-item label="关键词">
                <el-input v-model="query.keyword" clearable />
            </el-form-item>
            <el-form-item class="filter-form__actions">
                <el-button type="primary" native-type="submit" :loading="loading">查询</el-button>
                <el-button @click="reset">重置</el-button>
            </el-form-item>
        </FilterPanel>
        <el-alert v-if="failed" type="error" title="质量报告读取失败" :closable="false" />
        <el-button v-if="failed" @click="load">重试</el-button>
        <template v-if="data">
            <p>{{ data.meta.basis }}</p>
            <div class="quality-summary">
                <span>适用事项 {{ data.summary.total }} 项</span>
                <span>已反馈／评价 {{ data.summary.evaluated }} 项</span>
                <span>
                    覆盖率 {{ data.summary.coverage === null ? '—' : `${data.summary.coverage}%` }}
                </span>
                <span v-if="kind === 'service'">
                    有效反馈 {{ data.summary.samples }} 份 · 满意占比
                    {{ data.summary.satisfaction === null ? '—' : `${data.summary.satisfaction}%` }}
                </span>
            </div>
            <p>
                满意 {{ data.summary.satisfied }} · 一般 {{ data.summary.neutral }} ·
                {{ kind === 'service' ? '不满意' : '待改进' }} {{ data.summary.dissatisfied }}
                {{ kind === 'service' ? '份' : '项' }}
            </p>
            <el-progress
                v-if="data.summary.coverage !== null"
                :percentage="Number(data.summary.coverage)"
                :stroke-width="12"
            />
            <el-button
                v-if="store.hasPermission('analysis:report:export') && !useMock"
                :disabled="dirty || loading"
                :loading="exporting"
                @click="download"
            >
                导出质量报告
            </el-button>
            <p v-if="dirty">筛选条件已调整，请查询后查看对应结果。</p>
            <ResponsiveTable v-loading="loading" :data="data.list">
                <el-table-column prop="title" label="任务／合作事项" min-width="180" />
                <el-table-column prop="projectName" label="项目" min-width="160" />
                <el-table-column prop="teamName" :label="kind === 'service' ? '团队' : '资源'" />
                <el-table-column
                    prop="date"
                    :label="kind === 'service' ? '实际服务日期' : '评价日期'"
                    min-width="120"
                />
                <el-table-column label="反馈／评价">
                    <template #default="{ row }">
                        {{
                            row.status === 'ACTIVE'
                                ? '有效反馈'
                                : row.status === 'UNRATED'
                                  ? '未评价／反馈'
                                  : feedbackRatings[row.status as keyof typeof feedbackRatings]
                        }}
                    </template>
                </el-table-column>
                <el-table-column v-if="kind === 'service'" prop="samples" label="反馈份数" />
                <el-table-column prop="suggestions" label="建议／主要问题" min-width="180" />
                <el-table-column label="来源">
                    <template #default="{ row }">
                        <router-link :to="row.href">查看详情</router-link>
                    </template>
                </el-table-column>
            </ResponsiveTable>
            <ResponsivePagination
                v-model:current-page="query.page"
                v-model:page-size="query.pageSize"
                :total="data.total"
                @current-change="load"
                @size-change="search"
            />
        </template>
    </template>
    <el-empty v-else description="暂无相应质量查询权限" />
</template>
<style scoped>
.quality-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin: 16px 0;
}
</style>
