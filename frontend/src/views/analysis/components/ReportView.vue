<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useMock } from '@/api/config'
import { analysisApi } from '@/api/modules/analysis'
import { projectApi } from '@/api/modules/project'
import type {
    ReportKind,
    ManagementReport,
    ManagementQuery,
    ReportRow,
} from '@/api/management-types'
import FilterPanel from '@/components/FilterPanel.vue'
import RegionSelect from '@/components/RegionSelect.vue'
import ResponsiveTable from '@/components/ResponsiveTable.vue'
import ResponsivePagination from '@/components/ResponsivePagination.vue'
import { formatDateTime } from '@/utils/dateTime'
const props = defineProps<{ kind: ReportKind }>(),
    router = useRouter(),
    store = useUserStore()
const query = reactive<ManagementQuery & { page: number; pageSize: number; regionCode?: string }>({
        page: 1,
        pageSize: 20,
    }),
    report = ref<ManagementReport>(),
    failed = ref(false),
    loading = ref(false),
    exporting = ref(false),
    sources = ref<ReportRow[]>([]),
    sourceDialog = ref(false),
    detailLoading = ref(false)
const projects = ref<{ id: number; name: string }[]>([]),
    teams = ref<{ id: number; name: string }[]>([])
const owners = ref<{ id: number; name: string }[]>([]),
    indicators = ref<{ id: number; name: string }[]>([]),
    fields = ref<{ code: string; name: string }[]>([])
const sourceTotal = ref(0),
    sourcePage = ref(1),
    sourceKey = ref('')
const filterKeys: Record<ReportKind, string[]> = {
    progress: [
        'projectId',
        'teamId',
        'indicatorId',
        'regionCode',
        'keyword',
        'asOfDate',
        'serviceFieldCode',
    ],
    tasks: [
        'projectId',
        'teamId',
        'ownerId',
        'regionCode',
        'keyword',
        'status',
        'form',
        'dateFrom',
        'dateTo',
    ],
    approvals: ['projectId', 'teamId', 'keyword', 'status', 'dateFrom', 'dateTo'],
    resources: [
        'ownerId',
        'regionCode',
        'keyword',
        'status',
        'relationship',
        'unitType',
        'dateFrom',
        'dateTo',
    ],
}
const has = (key: string) => filterKeys[props.kind].includes(key)
let generation = 0
async function load() {
    const current = ++generation
    loading.value = true
    failed.value = false
    try {
        const result = await analysisApi.management(props.kind, { ...query })
        if (current === generation) {
            report.value = result
            if (result.options) {
                owners.value = [
                    ...new Map(
                        [...owners.value, ...result.options.owners].map((x) => [x.id, x]),
                    ).values(),
                ]
                indicators.value = [
                    ...new Map(
                        [...indicators.value, ...result.options.indicators].map((x) => [x.id, x]),
                    ).values(),
                ]
            }
        }
    } catch {
        if (current === generation) {
            failed.value = true
            report.value = undefined
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
    for (const key of Object.keys(query)) delete query[key]
    Object.assign(query, { page: 1, pageSize: 20 })
    search()
}
function frozen(): ManagementQuery {
    return {
        ...report.value!.meta.filters,
        fingerprint: report.value!.meta.fingerprint,
        referenceTime: report.value!.meta.referenceTime,
    }
}
async function detail(row: ReportRow) {
    if (props.kind !== 'progress') {
        if (row.href) await router.push(row.href)
        return
    }
    sourceKey.value = row.key
    sourcePage.value = 1
    await loadSources()
}
async function loadSources() {
    detailLoading.value = true
    try {
        const result = await analysisApi.managementDetails(props.kind, {
            ...frozen(),
            rowKey: sourceKey.value,
            page: sourcePage.value,
            pageSize: 20,
        })
        sources.value = result.list
        sourceTotal.value = result.total
        sourceDialog.value = true
    } catch {
        /* 请求层提示 */
    } finally {
        detailLoading.value = false
    }
}
async function download() {
    if (!report.value || exporting.value) return
    exporting.value = true
    try {
        const blob = await analysisApi.managementExport(props.kind, frozen()),
            url = URL.createObjectURL(blob),
            a = document.createElement('a')
        a.href = url
        a.download = `${report.value.title}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
    } catch {
        /* 请求层提示 */
    } finally {
        exporting.value = false
    }
}
onMounted(async () => {
    void load()
    if (!useMock && props.kind !== 'resources')
        try {
            const options = await projectApi.filterOptions()
            projects.value = options.projects ?? []
            teams.value = options.organizations
            fields.value = options.serviceFields
        } catch {
            /* 请求层提示 */
        }
})
</script>
<template>
    <section v-loading="loading">
        <FilterPanel @submit.prevent="search">
            <el-form-item v-if="has('projectId')" label="项目">
                <el-select v-model="query.projectId" clearable filterable>
                    <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
                </el-select>
            </el-form-item>
            <el-form-item v-if="has('teamId')" label="团队">
                <el-select v-model="query.teamId" clearable>
                    <el-option v-for="t in teams" :key="t.id" :label="t.name" :value="t.id" />
                </el-select>
            </el-form-item>
            <el-form-item v-if="has('indicatorId')" label="指标">
                <el-select v-model="query.indicatorId" clearable filterable>
                    <el-option v-for="i in indicators" :key="i.id" :label="i.name" :value="i.id" />
                </el-select>
            </el-form-item>
            <el-form-item v-if="has('serviceFieldCode')" label="服务领域">
                <el-select v-model="query.serviceFieldCode" clearable filterable>
                    <el-option v-for="f in fields" :key="f.code" :label="f.name" :value="f.code" />
                </el-select>
            </el-form-item>
            <el-form-item label="关键词">
                <el-input v-model="query.keyword" clearable />
            </el-form-item>
            <el-form-item v-if="has('regionCode')" label="地区">
                <RegionSelect v-model="query.regionCode" />
            </el-form-item>
            <el-form-item v-if="has('asOfDate')" label="业务截至日">
                <el-date-picker
                    v-model="query.asOfDate"
                    value-format="YYYY-MM-DD"
                    placeholder="默认今天"
                />
            </el-form-item>
            <el-form-item
                v-if="has('dateFrom')"
                :label="kind === 'resources' ? '到期日期起' : '日期起'"
            >
                <el-date-picker v-model="query.dateFrom" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item v-if="has('dateTo')" label="日期止">
                <el-date-picker v-model="query.dateTo" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item v-if="has('status')" label="状态">
                <el-select v-model="query.status" clearable>
                    <el-option
                        v-for="s in kind === 'tasks'
                            ? [
                                  ['TO_REGISTER', '待登记'],
                                  ['TO_SUBMIT', '待提交'],
                                  ['REJECTED', '已退回'],
                                  ['TO_CORRECT', '待更正'],
                                  ['IN_REVIEW', '待审批'],
                                  ['COMPLETED', '已完成'],
                                  ['CANCELED', '已取消'],
                                  ['SCHEDULED', '待开展'],
                                  ['TO_ORGANIZE', '待整理'],
                              ]
                            : kind === 'approvals'
                              ? [
                                    ['PENDING', '待审批'],
                                    ['APPROVED', '已通过'],
                                    ['REJECTED', '已退回'],
                                    ['CANCELLED', '已撤回'],
                                ]
                              : [
                                    ['PENDING', '待跟进'],
                                    ['OVERDUE', '已逾期'],
                                    ['COMPLETED', '已完成'],
                                    ['UNSCHEDULED', '普通记录'],
                                    ['NO_FOLLOWUP', '未登记跟进'],
                                ]"
                        :key="s[0]"
                        :label="s[1]"
                        :value="s[0]"
                    />
                </el-select>
            </el-form-item>
            <el-form-item v-if="has('form')" label="服务形式">
                <el-select v-model="query.form" clearable>
                    <el-option label="集体服务" value="COLLECTIVE" />
                    <el-option label="入户走访" value="HOME_VISIT" />
                    <el-option label="驻点服务" value="STATIONED" />
                </el-select>
            </el-form-item>
            <el-form-item v-if="has('relationship')" label="合作关系">
                <el-select v-model="query.relationship" clearable>
                    <el-option label="正在合作" value="CURRENT" />
                    <el-option label="潜在合作" value="POTENTIAL" />
                    <el-option label="历史合作" value="HISTORICAL" />
                </el-select>
            </el-form-item>
            <el-form-item v-if="has('unitType')" label="单位类型">
                <el-input v-model="query.unitType" clearable />
            </el-form-item>
            <el-form-item v-if="has('ownerId')" label="责任范围">
                <el-select v-model="query.ownerId" clearable placeholder="全部授权人员">
                    <el-option label="我负责的" :value="store.profile?.id ?? 0" />
                    <el-option
                        v-for="u in owners.filter((u) => u.id !== store.profile?.id)"
                        :key="u.id"
                        :label="u.name"
                        :value="u.id"
                    />
                </el-select>
            </el-form-item>
            <el-form-item class="filter-actions">
                <el-button type="primary" native-type="submit">查询</el-button>
                <el-button @click="reset">重置</el-button>
            </el-form-item>
        </FilterPanel>
        <el-alert v-if="failed" title="读取失败，请重试" type="error" :closable="false" />
        <el-button v-if="failed" @click="load">重新加载</el-button>
        <template v-if="report">
            <el-alert :title="report.meta.basis" type="info" :closable="false" />
            <p class="report-time">
                生成：{{ formatDateTime(report.meta.generatedAt) }}
                <span v-if="report.meta.filters.asOfDate">
                    · 业务截至：{{ report.meta.filters.asOfDate }}
                </span>
            </p>
            <div class="report-groups">
                <div v-for="g in report.groups" :key="g.name" class="report-group">
                    <span>{{ g.name }}</span>
                    <strong>{{ g.value }} 条</strong>
                    <el-progress
                        :percentage="report.total ? Math.round((g.value / report.total) * 100) : 0"
                        :show-text="false"
                    />
                </div>
            </div>
            <p v-for="a in report.averages" :key="a.name">
                {{ a.name }}：{{ a.hours ?? '—' }}小时 · 样本{{ a.samples }}条
            </p>
            <div class="page-actions">
                <el-button
                    v-if="store.hasPermission('analysis:report:export') && !useMock"
                    :loading="exporting"
                    @click="download"
                >
                    导出 Excel
                </el-button>
                <el-button @click="load">刷新</el-button>
            </div>
            <ResponsiveTable :data="report.list">
                <el-table-column
                    v-for="c in report.columns"
                    :key="c.key"
                    :prop="c.key"
                    :label="c.label"
                    min-width="130"
                >
                    <template #default="{ row }">{{ row[c.key] ?? '—' }}</template>
                </el-table-column>
                <el-table-column label="操作" width="130">
                    <template #default="{ row }">
                        <el-button
                            link
                            type="primary"
                            :loading="detailLoading"
                            @click="detail(row as ReportRow)"
                        >
                            {{ kind === 'progress' ? '来源明细' : '查看处理' }}
                        </el-button>
                    </template>
                </el-table-column>
            </ResponsiveTable>
            <ResponsivePagination
                v-model:current-page="query.page"
                v-model:page-size="query.pageSize"
                :total="report.total"
                :page-sizes="[10, 20, 50, 100]"
                @current-change="load"
                @size-change="search"
            />
        </template>
        <el-dialog v-model="sourceDialog" title="指标来源明细" width="850px">
            <ResponsiveTable :data="sources">
                <el-table-column prop="source" label="来源" />
                <el-table-column prop="date" label="业务日期" />
                <el-table-column prop="value" label="档案／申报值" />
                <el-table-column prop="note" label="说明" min-width="200" />
                <el-table-column label="操作">
                    <template #default="{ row }">
                        <el-button
                            v-if="row.href"
                            link
                            type="primary"
                            @click="router.push(row.href)"
                        >
                            查看档案
                        </el-button>
                    </template>
                </el-table-column>
            </ResponsiveTable>
            <ResponsivePagination
                v-model:current-page="sourcePage"
                :page-size="20"
                :total="sourceTotal"
                @current-change="loadSources"
            />
        </el-dialog>
    </section>
</template>
<style scoped>
.report-time {
    color: var(--el-text-color-secondary);
    font-size: 12px;
}
.report-groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin: 16px 0;
}
.report-group {
    padding: 14px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 6px;
    display: grid;
    gap: 8px;
}
.report-group strong {
    font-size: 18px;
}
@media (max-width: 767px) {
    .report-groups {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
